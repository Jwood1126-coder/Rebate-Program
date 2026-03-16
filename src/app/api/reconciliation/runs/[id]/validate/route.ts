// POST /api/reconciliation/runs/:id/validate — Run claim validation engine.
// Compares staged claim rows against contract terms and creates exception issues.

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { canEdit } from '@/lib/auth/roles';
import { validateRun } from '@/lib/reconciliation/validation.service';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
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

  const result = await validateRun(runId);

  if (!result.success) {
    return NextResponse.json({ error: 'Reconciliation run not found' }, { status: 404 });
  }

  return NextResponse.json(result);
}
