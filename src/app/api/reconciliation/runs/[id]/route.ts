// GET /api/reconciliation/runs/:id — Get a single reconciliation run with details.

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
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
