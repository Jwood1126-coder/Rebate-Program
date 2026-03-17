// GET /api/reconciliation/runs/:id/issues — List all issues for a reconciliation run.

import { NextRequest, NextResponse } from 'next/server';
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

  const [issues, progress] = await Promise.all([
    getRunIssues(runId),
    getRunProgress(runId),
  ]);

  return NextResponse.json({ issues, progress });
}
