// POST /api/reconciliation/runs/:id/reopen — Reopen a reviewed run.
// Clears all resolutions and resets the run to "review" status.
// Not allowed on committed or cancelled runs.

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { canEdit } from '@/lib/auth/roles';
import { reopenRun } from '@/lib/reconciliation/resolution.service';

export async function POST(
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

  const result = await reopenRun(runId, sessionResult.user.id);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
