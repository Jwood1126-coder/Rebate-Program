// POST /api/reconciliation/pos-upload — Upload and stage a distributor POS report.
// Attaches the POS data to an existing reconciliation run for cross-referencing.

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { canEdit } from '@/lib/auth/roles';
import { stagePosFile } from '@/lib/reconciliation/pos-staging.service';
import { prisma } from '@/lib/db/client';

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
    include: { distributor: { select: { id: true, code: true } } },
  });

  if (!run) {
    return NextResponse.json({ error: 'Reconciliation run not found' }, { status: 404 });
  }

  if (run.posBatchId) {
    return NextResponse.json({ error: 'This run already has a POS file attached. Remove it first to upload a new one.' }, { status: 409 });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());

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
