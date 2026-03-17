// Commit service (Phase R4).
// Writes approved claim resolutions back to master rebate_records.
//
// Semantics:
//   - Entire commit runs inside prisma.$transaction — all-or-nothing.
//   - CLM-001 (price mismatch) → supersede old record, create new at claimed price.
//   - CLM-003 (item not in contract) → create new record using issue metadata.
//   - CLM-006 (unknown item) → create item + record using issue metadata.
//   - Informational approvals → stamp committedRecordId, no master data writes.
//   - Rejected/dismissed/deferred → no writes.
//   - On failure: run stays "reviewed", all writes rolled back.

import { prisma } from '@/lib/db/client';
import { EXCEPTION_CODES } from './types';
import { AUDIT_ACTIONS } from '@/lib/constants/statuses';
import { computeInsertSnapshot, computeFieldDiff } from '@/lib/audit/diff';
import type { PrismaClient, Prisma } from '@prisma/client';

// Prisma interactive transaction client
type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface CommitResult {
  success: boolean;
  error?: string;
  failedIssueId?: number;
  summary: {
    totalApproved: number;
    recordsCreated: number;
    recordsSuperseded: number;
    recordsUpdated: number;
    itemsCreated: number;
    confirmed: number;
    rejected: number;
    dismissed: number;
    deferred: number;
  };
}

// Codes that create/modify master data when approved
const MUTATING_CODES = new Set([
  EXCEPTION_CODES.CLM_001,
  EXCEPTION_CODES.CLM_003,
  EXCEPTION_CODES.CLM_006,
]);

/**
 * Commit approved claims from a reviewed reconciliation run to master data.
 * All writes are atomic — if any approved mutating issue fails, everything rolls back.
 */
export async function commitRun(runId: number, userId: number): Promise<CommitResult> {
  // --- Pre-flight: load and validate run state ---
  const run = await prisma.reconciliationRun.findUnique({
    where: { id: runId },
    include: { distributor: true },
  });

  if (!run) {
    return { success: false, error: 'Run not found', summary: emptySummary() };
  }

  // Only reviewed or completed (legacy) runs can be committed
  if (run.status !== 'reviewed' && run.status !== 'completed') {
    return {
      success: false,
      error: `Run is in "${run.status}" status — must be fully reviewed before committing`,
      summary: emptySummary(),
    };
  }

  const issues = await prisma.reconciliationIssue.findMany({
    where: { reconciliationRunId: runId },
  });

  // Verify no unresolved issues remain
  const unresolved = issues.filter(i => i.resolution === null);
  if (unresolved.length > 0) {
    return {
      success: false,
      error: `${unresolved.length} unresolved issues remain`,
      summary: emptySummary(),
    };
  }

  // Partition by resolution
  const approved = issues.filter(i => i.resolution === 'approved');
  const rejectedCount = issues.filter(i => i.resolution === 'rejected').length;
  const dismissedCount = issues.filter(i => i.resolution === 'dismissed').length;
  const deferredCount = issues.filter(i => i.resolution === 'deferred').length;

  // Fast path: nothing approved — just mark committed
  if (approved.length === 0) {
    await prisma.reconciliationRun.update({
      where: { id: runId },
      data: { status: 'committed', completedAt: new Date() },
    });
    return {
      success: true,
      summary: {
        totalApproved: 0,
        recordsCreated: 0,
        recordsSuperseded: 0,
        recordsUpdated: 0,
        itemsCreated: 0,
        confirmed: 0,
        rejected: rejectedCount,
        dismissed: dismissedCount,
        deferred: deferredCount,
      },
    };
  }

  // --- Execute all writes inside a single transaction ---
  try {
    const txResult = await prisma.$transaction(async (tx: TxClient) => {
      let recordsCreated = 0;
      let recordsSuperseded = 0;
      let recordsUpdated = 0;
      let itemsCreated = 0;
      let confirmed = 0;

      for (const issue of approved) {
        const suggested = (issue.suggestedData ?? {}) as Record<string, unknown>;

        if (issue.code === EXCEPTION_CODES.CLM_001) {
          // ---------------------------------------------------------------
          // Price mismatch: supersede old record with corrected price
          // ---------------------------------------------------------------
          if (!issue.masterRecordId) {
            throw new CommitError(
              `CLM-001 issue ${issue.id} missing masterRecordId`,
              issue.id,
            );
          }

          const oldRecord = await tx.rebateRecord.findUnique({
            where: { id: issue.masterRecordId },
          });
          if (!oldRecord) {
            throw new CommitError(
              `CLM-001 issue ${issue.id}: master record ${issue.masterRecordId} not found`,
              issue.id,
            );
          }

          const newPrice = suggested.newPrice as number | undefined;
          if (newPrice === undefined || newPrice === null) {
            throw new CommitError(
              `CLM-001 issue ${issue.id}: suggestedData missing newPrice`,
              issue.id,
            );
          }

          const claimPeriodStart = run.claimPeriodStart;
          const sameStartDate =
            oldRecord.startDate.getTime() === claimPeriodStart.getTime();

          if (sameStartDate) {
            // Price wrong from the start — update in place (no supersession)
            await tx.rebateRecord.update({
              where: { id: oldRecord.id },
              data: { rebatePrice: newPrice, updatedById: userId },
            });

            await tx.reconciliationIssue.update({
              where: { id: issue.id },
              data: { committedRecordId: oldRecord.id },
            });

            await auditInTx(tx, 'rebate_records', oldRecord.id, AUDIT_ACTIONS.UPDATE,
              computeFieldDiff(
                { rebatePrice: Number(oldRecord.rebatePrice) },
                { rebatePrice: newPrice },
              ), userId);

            recordsUpdated++;
          } else {
            // Standard supersession: end-date old, create new
            const dayBefore = new Date(claimPeriodStart);
            dayBefore.setDate(dayBefore.getDate() - 1);

            const newRecord = await tx.rebateRecord.create({
              data: {
                rebatePlanId: oldRecord.rebatePlanId,
                itemId: oldRecord.itemId,
                rebatePrice: newPrice,
                startDate: claimPeriodStart,
                endDate: oldRecord.endDate,
                status: 'active',
                createdById: userId,
                updatedById: userId,
              },
            });

            await tx.rebateRecord.update({
              where: { id: oldRecord.id },
              data: {
                status: 'superseded',
                endDate: dayBefore,
                supersededById: newRecord.id,
                updatedById: userId,
              },
            });

            await tx.reconciliationIssue.update({
              where: { id: issue.id },
              data: { committedRecordId: newRecord.id },
            });

            // Audit: new record
            await auditInTx(tx, 'rebate_records', newRecord.id, AUDIT_ACTIONS.INSERT,
              computeInsertSnapshot({
                rebatePlanId: newRecord.rebatePlanId,
                itemId: newRecord.itemId,
                rebatePrice: Number(newRecord.rebatePrice),
                startDate: newRecord.startDate,
                endDate: newRecord.endDate,
                status: 'active',
                source: `reconciliation_run:${runId}`,
              }), userId);

            // Audit: old record supersession
            await auditInTx(tx, 'rebate_records', oldRecord.id, AUDIT_ACTIONS.UPDATE,
              computeFieldDiff(
                { status: oldRecord.status, endDate: oldRecord.endDate, rebatePrice: Number(oldRecord.rebatePrice) },
                { status: 'superseded', endDate: dayBefore, supersededById: newRecord.id },
              ), userId);

            recordsCreated++;
            recordsSuperseded++;
          }

        } else if (issue.code === EXCEPTION_CODES.CLM_003) {
          // ---------------------------------------------------------------
          // Item not in contract: add record under the specified plan
          // ---------------------------------------------------------------
          const planId = suggested.planId as number | undefined;
          if (!planId) {
            throw new CommitError(
              `CLM-003 issue ${issue.id}: no target plan — contract has multiple plans. Resolve manually.`,
              issue.id,
            );
          }

          const itemId = suggested.itemId as number | undefined;
          const claimedPrice = suggested.claimedPrice as number | undefined;
          if (!itemId || claimedPrice === undefined || claimedPrice === null) {
            throw new CommitError(
              `CLM-003 issue ${issue.id}: suggestedData missing itemId or claimedPrice`,
              issue.id,
            );
          }

          // Guard against duplicates
          const existing = await tx.rebateRecord.findFirst({
            where: {
              rebatePlanId: planId,
              itemId,
              status: { notIn: ['cancelled', 'superseded'] },
            },
          });

          if (existing) {
            // Record already exists — treat as confirmation
            await tx.reconciliationIssue.update({
              where: { id: issue.id },
              data: { committedRecordId: existing.id },
            });
            confirmed++;
          } else {
            const newRecord = await tx.rebateRecord.create({
              data: {
                rebatePlanId: planId,
                itemId,
                rebatePrice: claimedPrice,
                startDate: run.claimPeriodStart,
                endDate: null,
                status: 'active',
                createdById: userId,
                updatedById: userId,
              },
            });

            await tx.reconciliationIssue.update({
              where: { id: issue.id },
              data: { committedRecordId: newRecord.id },
            });

            await auditInTx(tx, 'rebate_records', newRecord.id, AUDIT_ACTIONS.INSERT,
              computeInsertSnapshot({
                rebatePlanId: planId,
                itemId,
                rebatePrice: claimedPrice,
                startDate: run.claimPeriodStart,
                status: 'active',
                source: `reconciliation_run:${runId}`,
              }), userId);

            recordsCreated++;
          }

        } else if (issue.code === EXCEPTION_CODES.CLM_006) {
          // ---------------------------------------------------------------
          // Unknown item: create item + record
          // ---------------------------------------------------------------
          const itemNumber = suggested.itemNumber as string | undefined;
          const claimedPrice = suggested.claimedPrice as number | undefined;
          const contractNumber = suggested.contractNumber as string | undefined;

          if (!itemNumber || claimedPrice === undefined || claimedPrice === null || !contractNumber) {
            throw new CommitError(
              `CLM-006 issue ${issue.id}: suggestedData missing required fields`,
              issue.id,
            );
          }

          // Find or create item
          let item = await tx.item.findUnique({ where: { itemNumber } });
          if (!item) {
            item = await tx.item.create({
              data: { itemNumber, isActive: true },
            });

            await auditInTx(tx, 'items', item.id, AUDIT_ACTIONS.INSERT,
              computeInsertSnapshot({
                itemNumber,
                isActive: true,
                source: `reconciliation_run:${runId}`,
              }), userId);

            itemsCreated++;
          }

          // Find contract and determine plan
          const contract = await tx.contract.findFirst({
            where: { contractNumber, distributorId: run.distributorId },
            include: { rebatePlans: { select: { id: true } } },
          });

          if (!contract || contract.rebatePlans.length === 0) {
            throw new CommitError(
              `CLM-006 issue ${issue.id}: contract "${contractNumber}" not found or has no plans`,
              issue.id,
            );
          }

          if (contract.rebatePlans.length > 1) {
            throw new CommitError(
              `CLM-006 issue ${issue.id}: contract "${contractNumber}" has ${contract.rebatePlans.length} plans — cannot auto-assign. Resolve manually.`,
              issue.id,
            );
          }

          const planId = contract.rebatePlans[0].id;

          const newRecord = await tx.rebateRecord.create({
            data: {
              rebatePlanId: planId,
              itemId: item.id,
              rebatePrice: claimedPrice,
              startDate: run.claimPeriodStart,
              endDate: null,
              status: 'active',
              createdById: userId,
              updatedById: userId,
            },
          });

          await tx.reconciliationIssue.update({
            where: { id: issue.id },
            data: { committedRecordId: newRecord.id },
          });

          await auditInTx(tx, 'rebate_records', newRecord.id, AUDIT_ACTIONS.INSERT,
            computeInsertSnapshot({
              rebatePlanId: planId,
              itemId: item.id,
              rebatePrice: claimedPrice,
              startDate: run.claimPeriodStart,
              status: 'active',
              source: `reconciliation_run:${runId}`,
            }), userId);

          recordsCreated++;

        } else {
          // ---------------------------------------------------------------
          // Informational approval (CLM-002, CLM-005, CLM-007-012, etc.)
          // No master data writes. Stamp committedRecordId if available.
          // ---------------------------------------------------------------
          if (issue.masterRecordId) {
            await tx.reconciliationIssue.update({
              where: { id: issue.id },
              data: { committedRecordId: issue.masterRecordId },
            });
          }
          confirmed++;
        }
      }

      // Transition run to committed — inside the transaction
      await tx.reconciliationRun.update({
        where: { id: runId },
        data: { status: 'committed', completedAt: new Date() },
      });

      // Audit the commit event itself
      await auditInTx(tx, 'reconciliation_runs', runId, AUDIT_ACTIONS.UPDATE,
        computeFieldDiff(
          { status: run.status },
          { status: 'committed', recordsCreated, recordsSuperseded, itemsCreated, confirmed },
        ), userId);

      return { recordsCreated, recordsSuperseded, recordsUpdated, itemsCreated, confirmed };
    });

    return {
      success: true,
      summary: {
        totalApproved: approved.length,
        ...txResult,
        rejected: rejectedCount,
        dismissed: dismissedCount,
        deferred: deferredCount,
      },
    };
  } catch (err) {
    // Transaction rolled back — run stays in reviewed status.
    if (err instanceof CommitError) {
      return {
        success: false,
        error: err.message,
        failedIssueId: err.issueId,
        summary: emptySummary(approved.length, rejectedCount, dismissedCount, deferredCount),
      };
    }
    const message = err instanceof Error ? err.message : 'Unknown commit error';
    return {
      success: false,
      error: `Commit failed: ${message}`,
      summary: emptySummary(approved.length, rejectedCount, dismissedCount, deferredCount),
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class CommitError extends Error {
  constructor(message: string, public issueId: number) {
    super(message);
    this.name = 'CommitError';
  }
}

function emptySummary(
  totalApproved = 0,
  rejected = 0,
  dismissed = 0,
  deferred = 0,
): CommitResult['summary'] {
  return {
    totalApproved,
    recordsCreated: 0,
    recordsSuperseded: 0,
    recordsUpdated: 0,
    itemsCreated: 0,
    confirmed: 0,
    rejected,
    dismissed,
    deferred,
  };
}

/** Write an audit log entry inside a Prisma transaction. */
async function auditInTx(
  tx: TxClient,
  tableName: string,
  recordId: number,
  action: string,
  changedFields: Record<string, unknown>,
  userId: number,
) {
  if (Object.keys(changedFields).length === 0) return;
  await tx.auditLog.create({
    data: {
      tableName,
      recordId,
      action,
      changedFields: changedFields as unknown as Prisma.InputJsonValue,
      userId,
    },
  });
}

// Re-export for use by consumers that check the type
export { MUTATING_CODES };
