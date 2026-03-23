/**
 * Contract Update Resolution + Commit Service (Phase C)
 *
 * Handles:
 * - Individual diff resolution (apply/skip/modify)
 * - Bulk resolution
 * - Run progress computation
 * - Commit: apply approved diffs to master data atomically
 *
 * Follows reconciliation resolution patterns where they genuinely fit.
 * Key difference: contract updates produce supersessions (changed prices)
 * and new records (added items), not claim validations.
 *
 * Supersession chain: each "changed" diff supersedes the matched record,
 * creating a linear chain A → B → C over repeated updates. If the target
 * record was already superseded (e.g., by a concurrent reconciliation commit),
 * the commit rejects that diff rather than breaking the chain.
 */

import { prisma } from "@/lib/db/client";
import type { PrismaClient, Prisma } from "@prisma/client";
import { CONTRACT_UPDATE_STATUSES, DIFF_TYPES } from "@/lib/constants/statuses";
import { deriveRecordStatus } from "@/lib/utils/dates";
import { computeInsertSnapshot } from "@/lib/audit/diff";

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const LOCKED_STATUSES = new Set<string>([
  CONTRACT_UPDATE_STATUSES.COMMITTED,
  CONTRACT_UPDATE_STATUSES.CANCELLED,
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolveDiffInput {
  resolution: "apply" | "skip" | "modify";
  resolutionData?: Record<string, unknown>;
  resolvedById: number;
}

export interface ResolveDiffResult {
  success: boolean;
  diff?: { id: number; resolution: string; resolvedAt: Date };
  error?: string;
  runProgress?: RunProgress;
}

export interface RunProgress {
  totalDiffs: number;
  resolvedCount: number;
  pendingCount: number;
  allResolved: boolean;
  breakdown: Record<string, number>;
}

export interface CommitResult {
  success: boolean;
  summary?: CommitSummary;
  error?: string;
  failedDiffId?: number;
}

export interface CommitSummary {
  totalApplied: number;
  recordsCreated: number;
  recordsSuperseded: number;
  skipped: number;
  modified: number;
  itemsCreated: number;
}

// ---------------------------------------------------------------------------
// Resolve a single diff
// ---------------------------------------------------------------------------

export async function resolveDiff(
  diffId: number,
  input: ResolveDiffInput,
  expectedRunId?: number,
): Promise<ResolveDiffResult> {
  const diff = await prisma.contractUpdateDiff.findUnique({
    where: { id: diffId },
    include: { run: { select: { id: true, status: true } } },
  });

  if (!diff) {
    return { success: false, error: "Diff not found" };
  }

  if (expectedRunId !== undefined && diff.runId !== expectedRunId) {
    return { success: false, error: "Diff does not belong to this run" };
  }

  if (LOCKED_STATUSES.has(diff.run.status)) {
    return { success: false, error: `Cannot resolve diffs on a ${diff.run.status} run` };
  }

  // Ambiguous diffs cannot be plain-applied without explicit plan disambiguation.
  // The user must resolve via "modify" with resolutionData.targetPlanId, or "skip".
  if (diff.matchStatus === "ambiguous" && input.resolution === "apply") {
    const hasTargetPlan = input.resolutionData && "targetPlanId" in input.resolutionData;
    if (!hasTargetPlan) {
      return {
        success: false,
        error: "Ambiguous diff requires explicit plan selection. Use 'modify' with resolutionData.targetPlanId, or 'skip'.",
      };
    }
  }

  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // Re-check run status inside tx
    const run = await tx.contractUpdateRun.findUnique({ where: { id: diff.runId } });
    if (!run || LOCKED_STATUSES.has(run.status)) {
      throw new Error("Run is locked");
    }

    const updated = await tx.contractUpdateDiff.update({
      where: { id: diffId },
      data: {
        resolution: input.resolution,
        resolutionData: (input.resolutionData ?? undefined) as Prisma.InputJsonValue | undefined,
        resolvedById: input.resolvedById,
        resolvedAt: now,
      },
    });

    // Compute progress and potentially update run status
    const progress = await computeRunProgress(tx, diff.runId);

    if (progress.allResolved && run.status === CONTRACT_UPDATE_STATUSES.STAGED) {
      await tx.contractUpdateRun.update({
        where: { id: diff.runId },
        data: { status: CONTRACT_UPDATE_STATUSES.REVIEW },
      });
    } else if (!progress.allResolved && run.status === CONTRACT_UPDATE_STATUSES.REVIEW) {
      await tx.contractUpdateRun.update({
        where: { id: diff.runId },
        data: { status: CONTRACT_UPDATE_STATUSES.STAGED },
      });
    }

    return { updated, progress };
  });

  return {
    success: true,
    diff: {
      id: result.updated.id,
      resolution: result.updated.resolution!,
      resolvedAt: result.updated.resolvedAt!,
    },
    runProgress: result.progress,
  };
}

// ---------------------------------------------------------------------------
// Bulk resolve
// ---------------------------------------------------------------------------

export async function bulkResolveDiffs(
  diffIds: number[],
  input: ResolveDiffInput,
  expectedRunId?: number,
): Promise<{ success: boolean; resolvedCount: number; runProgress?: RunProgress; error?: string }> {
  if (diffIds.length === 0) {
    return { success: false, resolvedCount: 0, error: "No diff IDs provided" };
  }

  // Bulk resolve only supports apply/skip — modify requires per-diff
  // resolutionData which updateMany cannot write per-row.
  if (input.resolution === "modify") {
    return { success: false, resolvedCount: 0, error: "Bulk resolve does not support 'modify'. Resolve individually." };
  }

  // Pre-flight: verify all diffs exist and belong to the expected run
  const diffs = await prisma.contractUpdateDiff.findMany({
    where: { id: { in: diffIds } },
    include: { run: { select: { id: true, status: true } } },
  });

  if (diffs.length !== diffIds.length) {
    return { success: false, resolvedCount: 0, error: "Some diffs not found" };
  }

  const runIds = new Set(diffs.map((d) => d.runId));
  if (runIds.size > 1) {
    return { success: false, resolvedCount: 0, error: "Diffs belong to multiple runs" };
  }

  const runId = diffs[0].runId;
  if (expectedRunId !== undefined && runId !== expectedRunId) {
    return { success: false, resolvedCount: 0, error: "Diffs do not belong to this run" };
  }

  if (LOCKED_STATUSES.has(diffs[0].run.status)) {
    return { success: false, resolvedCount: 0, error: `Cannot resolve diffs on a ${diffs[0].run.status} run` };
  }

  // Bulk apply must not include ambiguous diffs — they require individual
  // resolution with explicit plan selection via resolutionData.targetPlanId.
  if (input.resolution === "apply") {
    const ambiguousDiffs = diffs.filter((d) => d.matchStatus === "ambiguous");
    if (ambiguousDiffs.length > 0) {
      return {
        success: false,
        resolvedCount: 0,
        error: `${ambiguousDiffs.length} ambiguous diff(s) require individual resolution with explicit plan selection. Remove them from bulk apply or resolve individually.`,
      };
    }
  }

  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const run = await tx.contractUpdateRun.findUnique({ where: { id: runId } });
    if (!run || LOCKED_STATUSES.has(run.status)) {
      throw new Error("Run is locked");
    }

    await tx.contractUpdateDiff.updateMany({
      where: { id: { in: diffIds } },
      data: {
        resolution: input.resolution,
        resolvedById: input.resolvedById,
        resolvedAt: now,
      },
    });

    const progress = await computeRunProgress(tx, runId);

    if (progress.allResolved && run.status === CONTRACT_UPDATE_STATUSES.STAGED) {
      await tx.contractUpdateRun.update({
        where: { id: runId },
        data: { status: CONTRACT_UPDATE_STATUSES.REVIEW },
      });
    } else if (!progress.allResolved && run.status === CONTRACT_UPDATE_STATUSES.REVIEW) {
      await tx.contractUpdateRun.update({
        where: { id: runId },
        data: { status: CONTRACT_UPDATE_STATUSES.STAGED },
      });
    }

    return { count: diffIds.length, progress };
  });

  return {
    success: true,
    resolvedCount: result.count,
    runProgress: result.progress,
  };
}

// ---------------------------------------------------------------------------
// Commit: apply approved diffs to master data
// ---------------------------------------------------------------------------

export async function commitContractUpdate(
  runId: number,
  userId: number,
): Promise<CommitResult> {
  const run = await prisma.contractUpdateRun.findUnique({
    where: { id: runId },
    include: {
      diffs: true,
      contract: { select: { id: true, contractType: true } },
    },
  });

  if (!run) {
    return { success: false, error: "Run not found" };
  }

  if (run.status !== CONTRACT_UPDATE_STATUSES.REVIEW) {
    return { success: false, error: `Cannot commit a run in '${run.status}' status. All diffs must be resolved first.` };
  }

  // Verify all diffs are resolved
  const unresolvedCount = run.diffs.filter((d) => !d.resolution).length;
  if (unresolvedCount > 0) {
    return { success: false, error: `${unresolvedCount} diffs are still unresolved` };
  }

  const appliedDiffs = run.diffs.filter((d) => d.resolution === "apply" || d.resolution === "modify");
  const skippedDiffs = run.diffs.filter((d) => d.resolution === "skip");

  const summary: CommitSummary = {
    totalApplied: appliedDiffs.length,
    recordsCreated: 0,
    recordsSuperseded: 0,
    skipped: skippedDiffs.length,
    modified: run.diffs.filter((d) => d.resolution === "modify").length,
    itemsCreated: 0,
  };

  if (appliedDiffs.length === 0) {
    // Nothing to apply — mark committed and update lastReviewedAt.
    // A fully-reviewed skip-only run is still a valid contract review event.
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.contractUpdateRun.update({
        where: { id: runId },
        data: {
          status: CONTRACT_UPDATE_STATUSES.COMMITTED,
          committedById: userId,
          committedAt: now,
          commitSummary: summary as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.contract.update({
        where: { id: run.contractId },
        data: { lastReviewedAt: now },
      });
      await auditInTx(tx, "contract_update_runs", runId, "UPDATE", {
        status: { old: CONTRACT_UPDATE_STATUSES.REVIEW, new: CONTRACT_UPDATE_STATUSES.COMMITTED },
        committedById: { old: null, new: userId },
        commitSummary: { old: null, new: summary },
      }, userId);
    });
    return { success: true, summary };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date();

      // Defense in depth: reject future effective dates at commit time.
      // The route should have already rejected them, but the data model
      // cannot represent future-effective supersession correctly.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (run.effectiveDate && run.effectiveDate > today) {
        throw new Error("Future effective dates are not yet supported. Cannot commit.");
      }

      for (const diff of appliedDiffs) {
        // Supported resolutionData overrides (set via "modify" resolution):
        //   - price: override the new price
        //   - targetPlanId: assign to a different plan (for ambiguous diffs)
        //   - endDate: set an explicit end date (for removed diffs)
        // Note: per-diff effectiveDate is NOT supported. The run-level
        // effectiveDate (or today) applies uniformly to all diffs.
        const resData = (diff.resolutionData as Record<string, unknown>) ?? {};
        const effectivePrice = resData.price != null ? Number(resData.price) : diff.newPrice ? Number(diff.newPrice) : null;
        const effectivePlanId = resData.targetPlanId != null ? Number(resData.targetPlanId) : diff.rebatePlanId;
        const effectiveDate = run.effectiveDate ?? now;
        const effectiveEndDate = resData.endDate ? new Date(String(resData.endDate)) : null;

        if (diff.diffType === DIFF_TYPES.ADDED) {
          await commitAddedDiff(tx, diff, effectivePrice!, effectivePlanId!, effectiveDate, effectiveEndDate, userId, summary);
        } else if (diff.diffType === DIFF_TYPES.CHANGED) {
          await commitChangedDiff(tx, diff, effectivePrice!, effectivePlanId!, effectiveDate, effectiveEndDate, userId, summary);
        } else if (diff.diffType === DIFF_TYPES.REMOVED) {
          await commitRemovedDiff(tx, diff, effectiveDate, effectiveEndDate, userId, summary);
        }
      }

      // Update run
      await tx.contractUpdateRun.update({
        where: { id: runId },
        data: {
          status: CONTRACT_UPDATE_STATUSES.COMMITTED,
          committedById: userId,
          committedAt: now,
          commitSummary: summary as unknown as Prisma.InputJsonValue,
        },
      });

      // Auto-update lastReviewedAt on the contract
      await tx.contract.update({
        where: { id: run.contractId },
        data: { lastReviewedAt: now },
      });

      // Audit the commit event
      await auditInTx(tx, "contract_update_runs", runId, "UPDATE", {
        status: { old: CONTRACT_UPDATE_STATUSES.REVIEW, new: CONTRACT_UPDATE_STATUSES.COMMITTED },
        committedById: { old: null, new: userId },
        commitSummary: { old: null, new: summary },
      }, userId);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error during commit";
    return { success: false, error: message };
  }

  return { success: true, summary };
}

// ---------------------------------------------------------------------------
// Commit helpers
// ---------------------------------------------------------------------------

async function commitAddedDiff(
  tx: TxClient,
  diff: { id: number; itemId: number | null; itemNumber: string; newStandardPrice: unknown },
  price: number,
  planId: number,
  effectiveDate: Date,
  endDate: Date | null,
  userId: number,
  summary: CommitSummary,
) {
  // Resolve or create item
  let itemId = diff.itemId;
  if (!itemId) {
    let item = await tx.item.findFirst({ where: { itemNumber: diff.itemNumber } });
    if (!item) {
      item = await tx.item.create({ data: { itemNumber: diff.itemNumber } });
      summary.itemsCreated++;
    }
    itemId = item.id;
  }

  const status = deriveRecordStatus(effectiveDate, endDate, null, "active", new Date());

  const record = await tx.rebateRecord.create({
    data: {
      rebatePlanId: planId,
      itemId,
      rebatePrice: price,
      standardPrice: diff.newStandardPrice ? Number(diff.newStandardPrice) : null,
      startDate: effectiveDate,
      endDate,
      status,
      createdById: userId,
      updatedById: userId,
    },
  });

  await auditInTx(tx, "rebate_records", record.id, "INSERT",
    computeInsertSnapshot({ rebatePlanId: planId, itemId, rebatePrice: price, standardPrice: diff.newStandardPrice ? Number(diff.newStandardPrice) : null, startDate: effectiveDate, endDate, status }),
    userId);

  // Link committed record back to diff
  await tx.contractUpdateDiff.update({
    where: { id: diff.id },
    data: { committedRecordId: record.id },
  });

  summary.recordsCreated++;
}

async function commitChangedDiff(
  tx: TxClient,
  diff: { id: number; matchedRecordId: number | null; rebatePlanId: number | null; itemId: number | null; itemNumber: string; newStandardPrice: unknown },
  newPrice: number,
  targetPlanId: number | null,
  effectiveDate: Date,
  endDate: Date | null,
  userId: number,
  summary: CommitSummary,
) {
  if (!diff.matchedRecordId) {
    throw new Error(`Changed diff #${diff.id} has no matched record — cannot supersede`);
  }

  const oldRecord = await tx.rebateRecord.findUnique({ where: { id: diff.matchedRecordId } });
  if (!oldRecord) {
    throw new Error(`Matched record #${diff.matchedRecordId} not found`);
  }

  // Guard: if this record was already superseded (e.g., by a concurrent update or
  // reconciliation commit), reject rather than breaking the supersession chain.
  if (oldRecord.supersededById !== null) {
    throw new Error(
      `Record #${diff.matchedRecordId} was already superseded. ` +
      `The contract may have been updated since this run was staged. Please create a new update run.`
    );
  }

  // End-date the old record (day before effective date)
  const dayBefore = new Date(effectiveDate);
  dayBefore.setDate(dayBefore.getDate() - 1);

  const status = deriveRecordStatus(effectiveDate, endDate, null, "active", new Date());

  // Use targetPlanId if provided (from resolutionData for ambiguous diffs),
  // otherwise keep the old record's plan.
  const newPlanId = targetPlanId ?? oldRecord.rebatePlanId;

  // Create new record with updated price
  const newRecord = await tx.rebateRecord.create({
    data: {
      rebatePlanId: newPlanId,
      itemId: oldRecord.itemId,
      rebatePrice: newPrice,
      standardPrice: diff.newStandardPrice ? Number(diff.newStandardPrice) : oldRecord.standardPrice,
      startDate: effectiveDate,
      endDate: endDate ?? oldRecord.endDate,
      status,
      createdById: userId,
      updatedById: userId,
    },
  });

  // Supersede old record
  await tx.rebateRecord.update({
    where: { id: oldRecord.id },
    data: {
      supersededById: newRecord.id,
      endDate: dayBefore,
      status: "superseded",
      updatedById: userId,
    },
  });

  // Audit both
  await auditInTx(tx, "rebate_records", newRecord.id, "INSERT",
    computeInsertSnapshot({ rebatePlanId: newPlanId, itemId: oldRecord.itemId, rebatePrice: newPrice, startDate: effectiveDate }),
    userId);
  await auditInTx(tx, "rebate_records", oldRecord.id, "UPDATE", {
    status: { old: oldRecord.status, new: "superseded" },
    supersededById: { old: null, new: newRecord.id },
    endDate: { old: oldRecord.endDate?.toISOString() ?? null, new: dayBefore.toISOString() },
  }, userId);

  // Link committed record
  await tx.contractUpdateDiff.update({
    where: { id: diff.id },
    data: { committedRecordId: newRecord.id },
  });

  summary.recordsSuperseded++;
  summary.recordsCreated++;
}

async function commitRemovedDiff(
  tx: TxClient,
  diff: { id: number; matchedRecordId: number | null },
  effectiveDate: Date,
  endDate: Date | null,
  userId: number,
  summary: CommitSummary,
) {
  if (!diff.matchedRecordId) return;

  const record = await tx.rebateRecord.findUnique({ where: { id: diff.matchedRecordId } });
  if (!record) return;

  // End-date the record (day before effective date, or the provided end date)
  const endDateToUse = endDate ?? new Date(effectiveDate);
  if (!endDate) {
    endDateToUse.setDate(endDateToUse.getDate() - 1);
  }

  await tx.rebateRecord.update({
    where: { id: record.id },
    data: {
      endDate: endDateToUse,
      status: "expired",
      updatedById: userId,
    },
  });

  await auditInTx(tx, "rebate_records", record.id, "UPDATE", {
    endDate: { old: record.endDate?.toISOString() ?? null, new: endDateToUse.toISOString() },
    status: { old: record.status, new: "expired" },
  }, userId);

  summary.recordsSuperseded++;
}

// ---------------------------------------------------------------------------
// Run progress
// ---------------------------------------------------------------------------

async function computeRunProgress(tx: TxClient, runId: number): Promise<RunProgress> {
  const diffs = await tx.contractUpdateDiff.findMany({
    where: { runId },
    select: { resolution: true },
  });

  const total = diffs.length;
  const resolved = diffs.filter((d) => d.resolution !== null).length;
  const breakdown: Record<string, number> = {};
  for (const d of diffs) {
    if (d.resolution) {
      breakdown[d.resolution] = (breakdown[d.resolution] || 0) + 1;
    }
  }

  return {
    totalDiffs: total,
    resolvedCount: resolved,
    pendingCount: total - resolved,
    allResolved: total > 0 && resolved === total,
    breakdown,
  };
}

// ---------------------------------------------------------------------------
// Audit helper (inside transaction)
// ---------------------------------------------------------------------------

async function auditInTx(
  tx: TxClient,
  tableName: string,
  recordId: number,
  action: string,
  changedFields: Record<string, unknown>,
  userId: number,
) {
  await tx.auditLog.create({
    data: {
      tableName,
      recordId,
      action,
      changedFields: changedFields as Prisma.InputJsonValue,
      userId,
    },
  });
}
