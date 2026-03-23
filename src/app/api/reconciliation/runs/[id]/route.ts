// GET /api/reconciliation/runs/:id — Get a single reconciliation run with details.
// DELETE /api/reconciliation/runs/:id — Delete a reconciliation run and its data.

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { canEdit } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/client';
import { getReconciliationRun, getClaimRows } from '@/lib/reconciliation/staging.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionResult = await getSessionUser();
  if ('error' in sessionResult) return sessionResult.error;

  const { id } = await params;
  const runId = parseInt(id);
  if (isNaN(runId)) {
    return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 });
  }

  const run = await getReconciliationRun(runId);
  if (!run) {
    return NextResponse.json({ error: 'Reconciliation run not found' }, { status: 404 });
  }

  // Include paginated claim rows if the batch exists
  let claimRows = null;
  if (run.claimBatch) {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    claimRows = await getClaimRows(run.claimBatch.id, { page, pageSize });
  }

  return NextResponse.json({ run, claimRows });
}

/**
 * DELETE /api/reconciliation/runs/:id
 *
 * Deletes a reconciliation run and all associated data:
 * - reconciliation_issues (cascade from run)
 * - claim_rows (cascade from batch)
 * - claim_batch
 * - pos_batch (if attached)
 * - the run itself
 *
 * Committed runs CAN be deleted for testing/mistakes, but this is a destructive
 * operation that removes the reconciliation record. It does NOT undo any master
 * data changes that were committed (supersessions, new records, etc.).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionResult = await getSessionUser();
  if ('error' in sessionResult) return sessionResult.error;
  if (!canEdit(sessionResult.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { id } = await params;
  const runId = parseInt(id);
  if (isNaN(runId)) {
    return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 });
  }

  const run = await prisma.reconciliationRun.findUnique({
    where: { id: runId },
    select: { id: true, status: true, claimBatchId: true, posBatchId: true },
  });

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    // 1. Delete issues (cascaded by run delete, but be explicit)
    await tx.reconciliationIssue.deleteMany({ where: { reconciliationRunId: runId } });

    // 2. Unlink batch references before deleting run
    await tx.reconciliationRun.update({
      where: { id: runId },
      data: { claimBatchId: null, posBatchId: null },
    });

    // 3. Delete the run
    await tx.reconciliationRun.delete({ where: { id: runId } });

    // 4. Delete claim batch + rows (cascade)
    if (run.claimBatchId) {
      await tx.claimBatch.delete({ where: { id: run.claimBatchId } });
    }

    // 5. Delete POS batch + rows if attached
    if (run.posBatchId) {
      await tx.posBatch.delete({ where: { id: run.posBatchId } }).catch(() => {
        // POS batch may already be deleted or not exist
      });
    }
  });

  return NextResponse.json({ success: true, message: `Run #${runId} deleted` });
}
