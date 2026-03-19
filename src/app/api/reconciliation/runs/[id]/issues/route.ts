// GET /api/reconciliation/runs/:id/issues — List all issues + matched claim rows for a reconciliation run.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { getSessionUser } from '@/lib/auth/session';
import { getRunIssues, getRunProgress } from '@/lib/reconciliation/resolution.service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionResult = await getSessionUser();
  if ('error' in sessionResult) return sessionResult.error;

  const { id } = await params;
  const runId = parseInt(id);
  if (isNaN(runId)) {
    return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 });
  }

  // Load run to get claimBatchId
  const run = await prisma.reconciliationRun.findUnique({
    where: { id: runId },
    select: { claimBatchId: true },
  });

  const [issues, progress] = await Promise.all([
    getRunIssues(runId),
    getRunProgress(runId),
  ]);

  // Load all claim rows for this run's batch to show matched rows alongside exceptions
  let matchedRows: {
    id: number;
    rowNumber: number;
    itemNumber: string | null;
    contractNumber: string | null;
    deviatedPrice: string | null;
    quantity: string | null;
    transactionDate: string | null;
  }[] = [];

  if (run?.claimBatchId) {
    // Get claim row IDs that have issues
    const issueClaimRowIds = new Set(issues.map((i: { claimRowId: number | null }) => i.claimRowId).filter(Boolean));

    const allRows = await prisma.claimRow.findMany({
      where: { batchId: run.claimBatchId },
      select: {
        id: true,
        rowNumber: true,
        itemNumber: true,
        contractNumber: true,
        deviatedPrice: true,
        quantity: true,
        transactionDate: true,
        matchedRecordId: true,
      },
      orderBy: { rowNumber: 'asc' },
    });

    // Return only the rows WITHOUT issues (the clean matches)
    matchedRows = allRows
      .filter((r) => !issueClaimRowIds.has(r.id) && r.matchedRecordId !== null)
      .map((r) => ({
        id: r.id,
        rowNumber: r.rowNumber,
        itemNumber: r.itemNumber,
        contractNumber: r.contractNumber,
        deviatedPrice: r.deviatedPrice?.toString() ?? null,
        quantity: r.quantity?.toString() ?? null,
        transactionDate: r.transactionDate?.toISOString().split('T')[0] ?? null,
      }));
  }

  return NextResponse.json({ issues, progress, matchedRows });
}
