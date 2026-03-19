/**
 * Contract Reconciliation Status Service
 *
 * Batch-resolves reconciliation status for multiple contracts efficiently.
 * Avoids N+1 by doing 3 queries total: contracts → claim rows → runs.
 *
 * Query path: Contract.(contractNumber, distributorId) → ClaimRow → ClaimBatch → ReconciliationRun
 * Scoped by (contractNumber + distributorId) — see contract-activity.service.ts for scoping notes.
 */

import { prisma } from "@/lib/db/client";

export interface ContractReconStatus {
  contractId: number;
  lastCommittedAt: string | null;
  lastClaimPeriod: string | null; // "MM/DD/YYYY – MM/DD/YYYY"
  lastRunId: number | null;
  reconState: "reconciled" | "in_progress" | "never";
  openRunId: number | null;
  openRunStatus: string | null;
}

export interface ContractUpdateStatus {
  contractId: number;
  lastCommittedAt: string | null;
  lastRunId: number | null;
  changedCount: number;
  addedCount: number;
  removedCount: number;
}

/**
 * Get reconciliation status for all provided contracts in batch.
 * Filters to a specific claim period if provided.
 */
export async function getBatchReconStatus(
  contracts: { id: number; contractNumber: string; distributorId: number }[],
  periodStart?: Date,
  periodEnd?: Date,
): Promise<Map<number, ContractReconStatus>> {
  const result = new Map<number, ContractReconStatus>();

  if (contracts.length === 0) return result;

  // Initialize all as "never"
  for (const c of contracts) {
    result.set(c.id, {
      contractId: c.id,
      lastCommittedAt: null,
      lastClaimPeriod: null,
      lastRunId: null,
      reconState: "never",
      openRunId: null,
      openRunStatus: null,
    });
  }

  // Step 1: Find all claim rows that reference these contracts
  // Build (contractNumber, distributorId) pairs for OR query
  const contractKeys = contracts.map((c) => ({
    contractNumber: c.contractNumber,
    distributorId: c.distributorId,
  }));

  // Get unique distributor IDs for batch
  const distributorIds = [...new Set(contracts.map((c) => c.distributorId))];

  const claimRows = await prisma.claimRow.findMany({
    where: {
      contractNumber: { in: contracts.map((c) => c.contractNumber) },
      batch: { distributorId: { in: distributorIds } },
    },
    select: {
      contractNumber: true,
      batchId: true,
      batch: { select: { distributorId: true } },
    },
  });

  if (claimRows.length === 0) return result;

  // Build mapping: (contractNumber+distributorId) → Set<batchId>
  const batchIdsByContract = new Map<string, Set<number>>();
  for (const row of claimRows) {
    if (!row.contractNumber) continue;
    const key = `${row.contractNumber}:${row.batch.distributorId}`;
    if (!batchIdsByContract.has(key)) batchIdsByContract.set(key, new Set());
    batchIdsByContract.get(key)!.add(row.batchId);
  }

  // Step 2: Find all reconciliation runs for those batches
  const allBatchIds = [...new Set(claimRows.map((r) => r.batchId))];

  const runWhere: Record<string, unknown> = {
    claimBatchId: { in: allBatchIds },
  };
  // If filtering by period, only include runs overlapping that period
  if (periodStart && periodEnd) {
    runWhere.claimPeriodStart = { gte: periodStart };
    runWhere.claimPeriodEnd = { lte: periodEnd };
  }

  const runs = await prisma.reconciliationRun.findMany({
    where: runWhere,
    select: {
      id: true,
      status: true,
      claimBatchId: true,
      claimPeriodStart: true,
      claimPeriodEnd: true,
      completedAt: true,
      distributorId: true,
    },
    orderBy: { completedAt: "desc" },
  });

  // Build mapping: batchId → run (for quick lookup)
  const runsByBatch = new Map<number, typeof runs>();
  for (const run of runs) {
    if (run.claimBatchId === null) continue;
    if (!runsByBatch.has(run.claimBatchId)) runsByBatch.set(run.claimBatchId, []);
    runsByBatch.get(run.claimBatchId)!.push(run);
  }

  // Step 3: Compose status per contract
  for (const c of contracts) {
    const key = `${c.contractNumber}:${c.distributorId}`;
    const batchIds = batchIdsByContract.get(key);
    if (!batchIds) continue;

    let latestCommitted: typeof runs[number] | null = null;
    let latestOpen: typeof runs[number] | null = null;

    for (const batchId of batchIds) {
      const batchRuns = runsByBatch.get(batchId) || [];
      for (const run of batchRuns) {
        if (run.status === "committed") {
          if (!latestCommitted || (run.completedAt && latestCommitted.completedAt && run.completedAt > latestCommitted.completedAt)) {
            latestCommitted = run;
          }
        } else if (!["cancelled"].includes(run.status)) {
          if (!latestOpen) latestOpen = run;
        }
      }
    }

    const status = result.get(c.id)!;
    if (latestCommitted) {
      const ps = latestCommitted.claimPeriodStart;
      const pe = latestCommitted.claimPeriodEnd;
      status.reconState = "reconciled";
      status.lastCommittedAt = latestCommitted.completedAt?.toISOString() ?? null;
      status.lastClaimPeriod = `${fmtDate(ps)} – ${fmtDate(pe)}`;
      status.lastRunId = latestCommitted.id;
    }
    if (latestOpen) {
      status.openRunId = latestOpen.id;
      status.openRunStatus = latestOpen.status;
      if (status.reconState === "never") {
        status.reconState = "in_progress";
      }
    }
  }

  return result;
}

/**
 * Get last contract update status for all provided contracts.
 */
export async function getBatchUpdateStatus(
  contractIds: number[],
): Promise<Map<number, ContractUpdateStatus>> {
  const result = new Map<number, ContractUpdateStatus>();
  if (contractIds.length === 0) return result;

  const runs = await prisma.contractUpdateRun.findMany({
    where: {
      contractId: { in: contractIds },
      status: "committed",
    },
    select: {
      id: true,
      contractId: true,
      committedAt: true,
      changedCount: true,
      addedCount: true,
      removedCount: true,
    },
    orderBy: { committedAt: "desc" },
  });

  // Keep only the latest per contract
  for (const run of runs) {
    if (result.has(run.contractId)) continue; // already have more recent
    result.set(run.contractId, {
      contractId: run.contractId,
      lastCommittedAt: run.committedAt?.toISOString() ?? null,
      lastRunId: run.id,
      changedCount: run.changedCount,
      addedCount: run.addedCount,
      removedCount: run.removedCount,
    });
  }

  return result;
}

function fmtDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}
