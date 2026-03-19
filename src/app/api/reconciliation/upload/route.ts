// POST /api/reconciliation/upload — Upload and stage a distributor claim file.
// See docs/RECONCILIATION_DESIGN.md Section 4.2 Step 1.
//
// When no column mapping is configured for the distributor, the endpoint
// detects file headers and returns them so the client can show an inline
// mapping configuration flow (instead of forcing the user to leave the page).

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { canEdit } from '@/lib/auth/roles';
import { stageClaimFile } from '@/lib/reconciliation/staging.service';
import { getColumnMappingAsync } from '@/lib/reconciliation/column-mappings.server';
import { STANDARD_FIELD_LABELS, suggestMappings } from '@/lib/reconciliation/mapping-utils';
import { prisma } from '@/lib/db/client';
import { endOfMonth, startOfMonth, parse as parseDate } from 'date-fns';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  // Auth check
  const sessionResult = await getSessionUser();
  if ('error' in sessionResult) return sessionResult.error;
  if (!canEdit(sessionResult.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }
  const { user } = sessionResult;

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const distributorIdStr = formData.get('distributorId') as string | null;
  const claimPeriod = formData.get('claimPeriod') as string | null; // "YYYY-MM" format

  // Validate inputs
  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }
  if (!distributorIdStr) {
    return NextResponse.json({ error: 'Distributor is required' }, { status: 400 });
  }
  if (!claimPeriod || !/^\d{4}-\d{2}$/.test(claimPeriod)) {
    return NextResponse.json({ error: 'Claim period is required (format: YYYY-MM)' }, { status: 400 });
  }

  const distributorId = parseInt(distributorIdStr);
  if (isNaN(distributorId)) {
    return NextResponse.json({ error: 'Invalid distributor ID' }, { status: 400 });
  }

  // Look up distributor
  const distributor = await prisma.distributor.findUnique({
    where: { id: distributorId },
    select: { id: true, code: true, name: true },
  });
  if (!distributor) {
    return NextResponse.json({ error: 'Distributor not found' }, { status: 404 });
  }

  // Read file buffer
  const arrayBuffer = await file.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  // Check if column mapping exists
  const mapping = await getColumnMappingAsync(distributor.code);

  // Always detect headers so the user can review/confirm column mapping.
  // If a saved mapping exists, merge it with auto-suggestions so the user
  // sees the current mapping pre-filled but can adjust if file columns differ.
  const confirmMapping = formData.get('confirmMapping') === 'true';

  if (!mapping || !confirmMapping) {
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        return NextResponse.json({ error: 'File contains no sheets' }, { status: 400 });
      }
      const worksheet = workbook.Sheets[firstSheetName];
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, {
        defval: null,
        raw: false,
      });
      if (rows.length === 0) {
        return NextResponse.json({ error: 'File contains no data rows' }, { status: 400 });
      }

      const headers = Object.keys(rows[0]);
      const autoSuggested = suggestMappings(headers);

      // Merge saved mapping with auto-suggestions:
      // saved mapping takes priority, auto-suggestions fill gaps
      const suggested: Partial<Record<string, string>> = { ...autoSuggested };
      if (mapping) {
        // Overlay saved mapping — but only for columns that exist in this file
        for (const [field, col] of Object.entries(mapping)) {
          if (headers.includes(col as string)) {
            suggested[field] = col as string;
          }
          // If saved column doesn't exist in file, keep the auto-suggested one
        }
      }

      const sampleData: Record<string, string[]> = {};
      for (const header of headers) {
        sampleData[header] = rows
          .slice(0, 3)
          .map((row) => {
            const val = row[header];
            return val != null ? String(val).substring(0, 50) : '';
          })
          .filter(Boolean);
      }

      return NextResponse.json({
        needsMapping: true,
        hasSavedMapping: !!mapping,
        distributorId: distributor.id,
        distributorCode: distributor.code,
        distributorName: distributor.name,
        headers,
        suggestedMappings: suggested,
        sampleData,
        standardFields: STANDARD_FIELD_LABELS,
        totalRows: rows.length,
      });
    } catch {
      return NextResponse.json({
        error: `Could not parse the uploaded file for header detection. Please check the file format.`,
      }, { status: 422 });
    }
  }

  // Parse claim period into start/end dates
  const periodDate = parseDate(claimPeriod, 'yyyy-MM', new Date());
  const claimPeriodStart = startOfMonth(periodDate);
  const claimPeriodEnd = endOfMonth(periodDate);

  // Stage the claim file
  const result = await stageClaimFile({
    fileBuffer,
    fileName: file.name,
    distributorId: distributor.id,
    distributorCode: distributor.code,
    claimPeriodStart,
    claimPeriodEnd,
    userId: user.id,
  });

  if (!result.success) {
    return NextResponse.json({
      error: 'Failed to stage claim file',
      details: result.errors,
      parseResult: {
        totalRows: result.parseResult.totalRows,
        validRows: result.parseResult.validRows,
        errorRows: result.parseResult.errorRows,
        warnings: result.parseResult.warnings,
        errors: result.parseResult.errors,
      },
    }, { status: 422 });
  }

  return NextResponse.json({
    success: true,
    runId: result.runId,
    batchId: result.batchId,
    parseResult: {
      totalRows: result.parseResult.totalRows,
      validRows: result.parseResult.validRows,
      errorRows: result.parseResult.errorRows,
      warnings: result.parseResult.warnings,
    },
  });
}
