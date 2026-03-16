// POST /api/reconciliation/upload — Upload and stage a distributor claim file.
// See docs/RECONCILIATION_DESIGN.md Section 4.2 Step 1.

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { canEdit } from '@/lib/auth/roles';
import { stageClaimFile } from '@/lib/reconciliation/staging.service';
import { prisma } from '@/lib/db/client';
import { endOfMonth, startOfMonth, parse as parseDate } from 'date-fns';

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

  // Parse claim period into start/end dates
  const periodDate = parseDate(claimPeriod, 'yyyy-MM', new Date());
  const claimPeriodStart = startOfMonth(periodDate);
  const claimPeriodEnd = endOfMonth(periodDate);

  // Read file buffer
  const arrayBuffer = await file.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

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
