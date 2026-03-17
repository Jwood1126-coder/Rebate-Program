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
import type { PrismaClient, Prisma } from '@prisma/client';

// Prisma interactive transaction client
type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

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
 * All mutations (issue update, audit, run status) are atomic within a transaction.
 */
export async function resolveIssue(
  issueId: number,
  input: ResolveIssueInput,
  expectedRunId?: number,
): Promise<ResolveIssueResult> {
  // Pre-flight: load issue + run status (outside tx — read-only validation)
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

  try {
    // All mutations inside a single transaction — atomic resolution
    const { updated, runProgress } = await prisma.$transaction(async (tx) => {
      // Re-check run status inside transaction to close the preflight race window.
      // If another user committed/cancelled the run between our preflight and this point,
      // we'll see the updated status here and bail out safely.
      const currentRun = await tx.reconciliationRun.findUnique({
        where: { id: issue.reconciliationRunId },
        select: { status: true },
      });
      if (currentRun && LOCKED_STATUSES.has(currentRun.status)) {
        throw new LockedRunError(currentRun.status);
      }

      // Update the issue with resolution
      const upd = await tx.reconciliationIssue.update({
        where: { id: issueId },
        data: {
          resolution: input.resolution,
          resolutionNote: input.resolutionNote || null,
          resolvedById: input.resolvedById,
          resolvedAt: new Date(),
        },
      });

      // Audit the resolution inside transaction
      await tx.auditLog.create({
        data: {
          tableName: 'reconciliation_issues',
          recordId: issueId,
          action: 'UPDATE',
          changedFields: {
            resolution: { old: previousResolution, new: input.resolution },
            resolutionNote: { old: issue.resolutionNote, new: input.resolutionNote || null },
          } as unknown as Prisma.InputJsonValue,
          userId: input.resolvedById,
        },
      });

      // Get run progress inside tx (sees the just-updated issue)
      const progress = await getRunProgress(issue.reconciliationRunId, tx);

      // If all issues are resolved, update run status to reviewed
      if (progress.allResolved) {
        await tx.reconciliationRun.update({
          where: { id: issue.reconciliationRunId },
          data: {
            status: 'reviewed',
            completedAt: new Date(),
            approvedCount: progress.breakdown.approved || 0,
            rejectedCount: progress.breakdown.rejected || 0,
          },
        });
      } else if (issue.reconciliationRun.status === 'reviewed') {
        // If run was reviewed but user changed a resolution, revert to review
        await tx.reconciliationRun.update({
          where: { id: issue.reconciliationRunId },
          data: { status: 'review', completedAt: null },
        });
      }

      return { updated: upd, runProgress: progress };
    });

    return {
      success: true,
      issue: {
        id: updated.id,
        resolution: updated.resolution!,
        resolvedAt: updated.resolvedAt!,
      },
      runProgress,
    };
  } catch (err) {
    if (err instanceof LockedRunError) {
      return { success: false, error: `Cannot resolve issues on a ${err.status} run` };
    }
    throw err;
  }
}

/**
 * Bulk-resolve multiple issues with the same resolution.
 * All mutations (issue updates, audit entries, run status) are atomic within a transaction.
 */
export async function bulkResolveIssues(
  issueIds: number[],
  input: ResolveIssueInput,
  expectedRunId?: number,
): Promise<{ success: boolean; resolvedCount: number; error?: string; runProgress?: RunProgress }> {
  if (issueIds.length === 0) {
    return { success: true, resolvedCount: 0 };
  }

  // Pre-flight: validate issues exist, belong to same run, run not locked (outside tx)
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

  // All mutations inside a single transaction
  try {
  const runProgress = await prisma.$transaction(async (tx) => {
    // Re-check run status inside transaction to close preflight race window
    const currentRun = await tx.reconciliationRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    if (currentRun && LOCKED_STATUSES.has(currentRun.status)) {
      throw new LockedRunError(currentRun.status);
    }

    // Bulk update issues
    await tx.reconciliationIssue.updateMany({
      where: { id: { in: issueIds } },
      data: {
        resolution: input.resolution,
        resolutionNote: input.resolutionNote || null,
        resolvedById: input.resolvedById,
        resolvedAt: new Date(),
      },
    });

    // Audit each resolution change inside transaction
    for (const issue of issues) {
      await tx.auditLog.create({
        data: {
          tableName: 'reconciliation_issues',
          recordId: issue.id,
          action: 'UPDATE',
          changedFields: {
            resolution: { old: issue.resolution, new: input.resolution },
          } as unknown as Prisma.InputJsonValue,
          userId: input.resolvedById,
        },
      });
    }

    // Progress check inside tx (sees the just-updated issues)
    const progress = await getRunProgress(runId, tx);

    // If all issues are resolved, update run status
    if (progress.allResolved) {
      await tx.reconciliationRun.update({
        where: { id: runId },
        data: {
          status: 'reviewed',
          completedAt: new Date(),
          approvedCount: progress.breakdown.approved || 0,
          rejectedCount: progress.breakdown.rejected || 0,
        },
      });
    }

    return progress;
  });

  return {
    success: true,
    resolvedCount: issueIds.length,
    runProgress,
  };
  } catch (err) {
    if (err instanceof LockedRunError) {
      return { success: false, resolvedCount: 0, error: `Cannot resolve issues on a ${err.status} run` };
    }
    throw err;
  }
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
 * Accepts optional tx client so it can read inside a transaction (sees uncommitted writes).
 */
export async function getRunProgress(runId: number, db?: TxClient): Promise<RunProgress> {
  const client = db || prisma;
  const issues = await client.reconciliationIssue.findMany({
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
 * Joins claim row data for inline review context.
 */
export async function getRunIssues(runId: number) {
  const issues = await prisma.reconciliationIssue.findMany({
    where: { reconciliationRunId: runId },
    include: {
      resolvedBy: { select: { displayName: true } },
    },
    orderBy: [{ claimRowId: 'asc' }, { code: 'asc' }],
  });

  // Join claim row data for context (no Prisma relation exists)
  const claimRowIds = [...new Set(issues.map(i => i.claimRowId).filter((id): id is number => id !== null))];
  const claimRowMap = new Map<number, {
    rowNumber: number;
    contractNumber: string | null;
    planCode: string | null;
    itemNumber: string | null;
    deviatedPrice: number | null;
    quantity: number | null;
    claimedAmount: number | null;
    transactionDate: Date | null;
    endUserCode: string | null;
    endUserName: string | null;
    distributorOrderNumber: string | null;
    matchedRecordId: number | null;
  }>();

  if (claimRowIds.length > 0) {
    const claimRows = await prisma.claimRow.findMany({
      where: { id: { in: claimRowIds } },
      select: {
        id: true, rowNumber: true, contractNumber: true, planCode: true,
        itemNumber: true, deviatedPrice: true, quantity: true, claimedAmount: true,
        transactionDate: true, endUserCode: true, endUserName: true,
        distributorOrderNumber: true, matchedRecordId: true,
      },
    });
    for (const row of claimRows) {
      claimRowMap.set(row.id, {
        rowNumber: row.rowNumber,
        contractNumber: row.contractNumber,
        planCode: row.planCode,
        itemNumber: row.itemNumber,
        deviatedPrice: row.deviatedPrice ? Number(row.deviatedPrice) : null,
        quantity: row.quantity ? Number(row.quantity) : null,
        claimedAmount: row.claimedAmount ? Number(row.claimedAmount) : null,
        transactionDate: row.transactionDate,
        endUserCode: row.endUserCode,
        endUserName: row.endUserName,
        distributorOrderNumber: row.distributorOrderNumber,
        matchedRecordId: row.matchedRecordId,
      });
    }
  }

  return issues.map(issue => ({
    ...issue,
    claimRow: issue.claimRowId ? claimRowMap.get(issue.claimRowId) ?? null : null,
  }));
}

// ---------------------------------------------------------------------------
// Internal error for transaction-level locked-run detection
// ---------------------------------------------------------------------------

class LockedRunError extends Error {
  constructor(public status: string) {
    super(`Run is ${status}`);
    this.name = 'LockedRunError';
  }
}
