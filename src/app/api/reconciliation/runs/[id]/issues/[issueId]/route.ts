// PATCH /api/reconciliation/runs/:id/issues/:issueId — Resolve a single issue.
// POST  /api/reconciliation/runs/:id/issues/:issueId — Alias for PATCH (convenience).

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { canEdit } from '@/lib/auth/roles';
import { resolveIssue } from '@/lib/reconciliation/resolution.service';

const VALID_RESOLUTIONS = ['approved', 'rejected', 'adjusted', 'deferred', 'dismissed'] as const;

async function handleResolve(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; issueId: string }> }
) {
  // Auth check
  const sessionResult = await getSessionUser();
  if ('error' in sessionResult) return sessionResult.error;
  if (!canEdit(sessionResult.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { id, issueId } = await params;
  const runId = parseInt(id);
  const issueIdNum = parseInt(issueId);
  if (isNaN(runId) || isNaN(issueIdNum)) {
    return NextResponse.json({ error: 'Invalid run or issue ID' }, { status: 400 });
  }

  const body = await request.json();
  const { resolution, resolutionNote } = body;

  if (!resolution || !VALID_RESOLUTIONS.includes(resolution)) {
    return NextResponse.json(
      { error: `Invalid resolution. Must be one of: ${VALID_RESOLUTIONS.join(', ')}` },
      { status: 400 }
    );
  }

  const result = await resolveIssue(issueIdNum, {
    resolution,
    resolutionNote,
    resolvedById: sessionResult.user.id,
  }, runId);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}

export const PATCH = handleResolve;
export const POST = handleResolve;
