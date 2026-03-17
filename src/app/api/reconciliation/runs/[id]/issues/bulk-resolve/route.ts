// POST /api/reconciliation/runs/:id/issues/bulk-resolve — Resolve multiple issues at once.

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { canEdit } from '@/lib/auth/roles';
import { bulkResolveIssues } from '@/lib/reconciliation/resolution.service';

const VALID_RESOLUTIONS = ['approved', 'rejected', 'adjusted', 'deferred', 'dismissed'] as const;

export async function POST(
  request: NextRequest,
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

  const body = await request.json();
  const { issueIds, resolution, resolutionNote } = body;

  if (!Array.isArray(issueIds) || issueIds.length === 0) {
    return NextResponse.json({ error: 'issueIds must be a non-empty array' }, { status: 400 });
  }

  if (!resolution || !VALID_RESOLUTIONS.includes(resolution)) {
    return NextResponse.json(
      { error: `Invalid resolution. Must be one of: ${VALID_RESOLUTIONS.join(', ')}` },
      { status: 400 }
    );
  }

  const result = await bulkResolveIssues(issueIds, {
    resolution,
    resolutionNote,
    resolvedById: sessionResult.user.id,
  }, runId);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
