// Exception resolution service (Phase R3).
// Handles resolving individual reconciliation issues and updating run status.
//
// Resolution types:
//   - approved: Claim line accepted as-is
//   - rejected: Claim line denied
//   - adjusted: Claim line accepted with corrected values
//   - deferred: Decision postponed for later review
//   - dismissed: Issue acknowledged but no action needed (e.g., warnings)

import { prisma } from '@/lib/db/client';
import { auditService } from '@/lib/audit/audit.service';

// Statuses that block resolution changes
const LOCKED_STATUSES = new Set(['committed', 'cancelled']);

export interface ResolveIssueInput {
  resolution: 'approved' | 'rejected' | 'adjusted' | 'deferred' | 'dismissed';
  resolutionNote?: string;
  resolvedById: number;
}

export interface ResolveIssueResult {
  success: boolean;
  issue?: {
    id: number;
    resolution: string;
    resolvedAt: Date;
  };
  error?: string;
  runProgress?: RunProgress;
}

export interface RunProgress {
  totalIssues: number;
  resolvedCount: number;
  pendingCount: number;
  allResolved: boolean;
  breakdown: Record<string, number>;
}

/**
 * Resolve a single reconciliation issue.
 * Validates issue belongs to the given run and the run is in a resolvable state.
 */
export async function resolveIssue(
  issueId: number,
  input: ResolveIssueInput,
  expectedRunId?: number,
): Promise<ResolveIssueResult> {
  const issue = await prisma.reconciliationIssue.findUnique({
    where: { id: issueId },
    include: { reconciliationRun: { select: { id: true, status: true } } },
  });

  if (!issue) {
    return { success: false, error: 'Issue not found' };
  }

  // Verify issue belongs to the expected run (route scoping)
  if (expectedRunId !== undefined && issue.reconciliationRunId !== expectedRunId) {
    return { success: false, error: 'Issue does not belong to this run' };
  }

  // Block resolution on locked runs
  if (LOCKED_STATUSES.has(issue.reconciliationRun.status)) {
    return {
      success: false,
      error: `Cannot resolve issues on a ${issue.reconciliationRun.status} run`,
    };
  }

  const previousResolution = issue.resolution;

  // Update the issue with resolution
  const updated = await prisma.reconciliationIssue.update({
    where: { id: issueId },
    data: {
      resolution: input.resolution,
      resolutionNote: input.resolutionNote || null,
      resolvedById: input.resolvedById,
      resolvedAt: new Date(),
    },
  });

  // Audit the resolution
  await auditService.logUpdate(
    'reconciliation_issues',
    issueId,
    { resolution: previousResolution, resolutionNote: issue.resolutionNote },
    { resolution: input.resolution, resolutionNote: input.resolutionNote || null },
    input.resolvedById,
  );

  // Get run progress after resolution
  const runProgress = await getRunProgress(issue.reconciliationRunId);

  // If all issues are resolved, update run status to reviewed
  if (runProgress.allResolved) {
    await prisma.reconciliationRun.update({
      where: { id: issue.reconciliationRunId },
      data: {
        status: 'reviewed',
        completedAt: new Date(),
        approvedCount: runProgress.breakdown.approved || 0,
        rejectedCount: runProgress.breakdown.rejected || 0,
      },
    });
  } else if (issue.reconciliationRun.status === 'reviewed') {
    // If run was reviewed but user changed a resolution, revert to review
    await prisma.reconciliationRun.update({
      where: { id: issue.reconciliationRunId },
      data: { status: 'review', completedAt: null },
    });
  }

  return {
    success: true,
    issue: {
      id: updated.id,
      resolution: updated.resolution!,
      resolvedAt: updated.resolvedAt!,
    },
    runProgress,
  };
}

/**
 * Bulk-resolve multiple issues with the same resolution.
 */
export async function bulkResolveIssues(
  issueIds: number[],
  input: ResolveIssueInput,
  expectedRunId?: number,
): Promise<{ success: boolean; resolvedCount: number; error?: string; runProgress?: RunProgress }> {
  if (issueIds.length === 0) {
    return { success: true, resolvedCount: 0 };
  }

  // Verify all issues exist and belong to the same run
  const issues = await prisma.reconciliationIssue.findMany({
    where: { id: { in: issueIds } },
    select: { id: true, reconciliationRunId: true, resolution: true },
  });

  if (issues.length !== issueIds.length) {
    return { success: false, resolvedCount: 0, error: 'One or more issues not found' };
  }

  const runIds = new Set(issues.map(i => i.reconciliationRunId));
  if (runIds.size > 1) {
    return { success: false, resolvedCount: 0, error: 'Issues belong to different runs' };
  }

  const runId = [...runIds][0];

  // Verify run scoping if expectedRunId provided
  if (expectedRunId !== undefined && runId !== expectedRunId) {
    return { success: false, resolvedCount: 0, error: 'Issues do not belong to this run' };
  }

  // Check run status
  const run = await prisma.reconciliationRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });
  if (run && LOCKED_STATUSES.has(run.status)) {
    return {
      success: false,
      resolvedCount: 0,
      error: `Cannot resolve issues on a ${run.status} run`,
    };
  }

  // Bulk update
  await prisma.reconciliationIssue.updateMany({
    where: { id: { in: issueIds } },
    data: {
      resolution: input.resolution,
      resolutionNote: input.resolutionNote || null,
      resolvedById: input.resolvedById,
      resolvedAt: new Date(),
    },
  });

  // Audit each resolution change
  for (const issue of issues) {
    await auditService.logUpdate(
      'reconciliation_issues',
      issue.id,
      { resolution: issue.resolution },
      { resolution: input.resolution },
      input.resolvedById,
    );
  }

  const runProgress = await getRunProgress(runId);

  // If all issues are resolved, update run status
  if (runProgress.allResolved) {
    await prisma.reconciliationRun.update({
      where: { id: runId },
      data: {
        status: 'reviewed',
        completedAt: new Date(),
        approvedCount: runProgress.breakdown.approved || 0,
        rejectedCount: runProgress.breakdown.rejected || 0,
      },
    });
  }

  return {
    success: true,
    resolvedCount: issueIds.length,
    runProgress,
  };
}

/**
 * Reopen a reviewed run: clear all resolutions, reset to review status.
 * Only allowed for runs in "reviewed" status (not committed or cancelled).
 */
export async function reopenRun(
  runId: number,
  userId: number,
): Promise<{ success: boolean; error?: string }> {
  const run = await prisma.reconciliationRun.findUnique({
    where: { id: runId },
    select: { id: true, status: true },
  });

  if (!run) {
    return { success: false, error: 'Run not found' };
  }

  if (run.status === 'committed') {
    return { success: false, error: 'Cannot reopen a committed run — master data has already been written' };
  }

  if (run.status === 'cancelled') {
    return { success: false, error: 'Cannot reopen a cancelled run' };
  }

  if (run.status !== 'reviewed' && run.status !== 'review' && run.status !== 'completed') {
    return { success: false, error: `Cannot reopen a run in "${run.status}" status` };
  }

  // All writes in a single transaction — atomic reopen
  await prisma.$transaction(async (tx) => {
    // Clear all resolutions and committedRecordId stamps
    await tx.reconciliationIssue.updateMany({
      where: { reconciliationRunId: runId },
      data: {
        resolution: null,
        resolutionNote: null,
        resolvedById: null,
        resolvedAt: null,
        committedRecordId: null,
      },
    });

    // Reset run status to review
    await tx.reconciliationRun.update({
      where: { id: runId },
      data: {
        status: 'review',
        completedAt: null,
        approvedCount: 0,
        rejectedCount: 0,
      },
    });

    // Audit the reopen inside the transaction
    await tx.auditLog.create({
      data: {
        tableName: 'reconciliation_runs',
        recordId: runId,
        action: 'UPDATE',
        changedFields: {
          status: { old: run.status, new: 'review' },
          action: { old: null, new: 'reopen' },
        },
        userId,
      },
    });
  });

  return { success: true };
}

/**
 * Get resolution progress for a run.
 */
export async function getRunProgress(runId: number): Promise<RunProgress> {
  const issues = await prisma.reconciliationIssue.findMany({
    where: { reconciliationRunId: runId },
    select: { resolution: true },
  });

  const totalIssues = issues.length;
  const resolvedCount = issues.filter(i => i.resolution !== null).length;
  const pendingCount = totalIssues - resolvedCount;

  // Count by resolution type
  const breakdown: Record<string, number> = {};
  for (const issue of issues) {
    if (issue.resolution) {
      breakdown[issue.resolution] = (breakdown[issue.resolution] || 0) + 1;
    }
  }

  return {
    totalIssues,
    resolvedCount,
    pendingCount,
    allResolved: pendingCount === 0 && totalIssues > 0,
    breakdown,
  };
}

/**
 * Get all issues for a reconciliation run with claim row details.
 */
export async function getRunIssues(runId: number) {
  return prisma.reconciliationIssue.findMany({
    where: { reconciliationRunId: runId },
    include: {
      resolvedBy: { select: { displayName: true } },
    },
    orderBy: [{ claimRowId: 'asc' }, { code: 'asc' }],
  });
}
