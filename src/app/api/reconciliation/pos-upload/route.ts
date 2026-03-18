// POST /api/reconciliation/pos-upload — Upload and stage a distributor POS report.
// Attaches the POS data to an existing reconciliation run for cross-referencing.
//
// When no POS column mapping is configured for the distributor, the endpoint
// detects file headers and returns them so the client can show an inline
// mapping configuration flow (same pattern as claim upload).

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { canEdit } from '@/lib/auth/roles';
import { stagePosFile } from '@/lib/reconciliation/pos-staging.service';
import { getColumnMappingAsync } from '@/lib/reconciliation/column-mappings.server';
import { POS_FIELD_LABELS, suggestPosMappings } from '@/lib/reconciliation/mapping-utils';
import { prisma } from '@/lib/db/client';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  // Auth check
  const sessionResult = await getSessionUser();
  if ('error' in sessionResult) return sessionResult.error;
  if (!canEdit(sessionResult.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }
  const { user } = sessionResult;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const runIdStr = formData.get('runId') as string | null;

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }
  if (!runIdStr) {
    return NextResponse.json({ error: 'Reconciliation run ID is required' }, { status: 400 });
  }

  const runId = parseInt(runIdStr);
  if (isNaN(runId)) {
    return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 });
  }

  // Look up the reconciliation run
  const run = await prisma.reconciliationRun.findUnique({
    where: { id: runId },
    include: { distributor: { select: { id: true, code: true, name: true } } },
  });

  if (!run) {
    return NextResponse.json({ error: 'Reconciliation run not found' }, { status: 404 });
  }

  if (run.posBatchId) {
    return NextResponse.json({ error: 'This run already has a POS file attached. Remove it first to upload a new one.' }, { status: 409 });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());

  // Check if POS column mapping exists — if not, return detected headers for inline configuration
  const mapping = await getColumnMappingAsync(run.distributor.code, 'pos');
  if (!mapping) {
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
      const suggested = suggestPosMappings(headers);
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
        fileType: 'pos',
        distributorId: run.distributor.id,
        distributorCode: run.distributor.code,
        distributorName: run.distributor.name,
        headers,
        suggestedMappings: suggested,
        sampleData,
        standardFields: POS_FIELD_LABELS,
        totalRows: rows.length,
      });
    } catch {
      return NextResponse.json({
        error: `No POS column mapping configured for distributor "${run.distributor.code}" and the file could not be parsed for header detection.`,
      }, { status: 422 });
    }
  }

  const result = await stagePosFile({
    fileBuffer,
    fileName: file.name,
    distributorId: run.distributor.id,
    distributorCode: run.distributor.code,
    periodStart: run.claimPeriodStart,
    periodEnd: run.claimPeriodEnd,
    userId: user.id,
    reconciliationRunId: run.id,
  });

  if (!result.success) {
    return NextResponse.json({
      error: 'Failed to stage POS file',
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
    batchId: result.batchId,
    parseResult: {
      totalRows: result.parseResult.totalRows,
      validRows: result.parseResult.validRows,
      errorRows: result.parseResult.errorRows,
      warnings: result.parseResult.warnings,
    },
  });
}
