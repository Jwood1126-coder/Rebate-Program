/**
 * Contract Activity + Dispute Query Helpers
 *
 * Extracted from route handlers for testability.
 * These are pure query/composition functions — no writes.
 */

import { prisma } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelineEvent {
  type: string;
  timestamp: string;
  user: string;
  summary: string;
  detail?: Record<string, unknown>;
}

export interface DisputeRun {
  runId: number;
  claimPeriod: string;
  runStatus: string;
  runDate: string;
  issues: {
    id: number;
    code: string;
    severity: string;
    category: string;
    description: string;
    resolution: string | null;
  }[];
}

export interface DisputeResult {
  runs: DisputeRun[];
  totalIssues: number;
  bySeverity: Record<string, number>;
  byCode: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Activity: compose timeline events for a contract
// ---------------------------------------------------------------------------

export async function getContractActivity(
  contractId: number,
  distributorId: number,
  planIds: number[],
  limit: number,
): Promise<TimelineEvent[]> {
  // Resolve record IDs under this contract's plans (shared by sources 3 + 4)
  const contractRecordIds = planIds.length > 0
    ? await prisma.rebateRecord
        .findMany({ where: { rebatePlanId: { in: planIds } }, select: { id: true } })
        .then((recs) => recs.map((r) => r.id))
    : [];

  // Fetch four sources in parallel
  const [contractAudit, updateRuns, recordAudit, reconRuns] = await Promise.all([
    // 1. Direct contract audit entries
    prisma.auditLog.findMany({
      where: { tableName: "contracts", recordId: contractId },
      include: { user: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),

    // 2. Contract update runs
    prisma.contractUpdateRun.findMany({
      where: { contractId },
      include: {
        runBy: { select: { displayName: true } },
        committedBy: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),

    // 3. Rebate record audit entries under this contract's plans
    contractRecordIds.length > 0
      ? prisma.auditLog.findMany({
          where: {
            tableName: "rebate_records",
            recordId: { in: contractRecordIds },
          },
          include: { user: { select: { displayName: true } } },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : [],

    // 4. Reconciliation runs that touched records under this contract's plans
    // via masterRecordId OR committedRecordId
    contractRecordIds.length > 0
      ? prisma.reconciliationRun.findMany({
          where: {
            issues: {
              some: {
                OR: [
                  { masterRecordId: { in: contractRecordIds } },
                  { committedRecordId: { in: contractRecordIds } },
                ],
              },
            },
            status: { in: ["review", "reviewed", "committed"] },
          },
          include: { runBy: { select: { displayName: true } } },
          orderBy: { startedAt: "desc" },
          take: limit,
        })
      : [],
  ]);

  // Normalize into timeline events
  const events: TimelineEvent[] = [];

  for (const entry of contractAudit) {
    const fields = entry.changedFields as Record<string, unknown>;
    const fieldNames = Object.keys(fields);
    events.push({
      type: "contract_update",
      timestamp: entry.createdAt.toISOString(),
      user: entry.user.displayName,
      summary: `Contract ${entry.action.toLowerCase()}: ${fieldNames.join(", ")}`,
      detail: { action: entry.action, changedFields: fields },
    });
  }

  for (const run of updateRuns) {
    if (run.status === "committed" && run.commitSummary) {
      const s = run.commitSummary as Record<string, unknown>;
      const committer = run.committedBy?.displayName ?? run.runBy.displayName;
      events.push({
        type: "contract_update_committed",
        timestamp: (run.committedAt ?? run.createdAt).toISOString(),
        user: committer,
        summary: `Contract update committed: ${s.recordsCreated || 0} created, ${s.recordsSuperseded || 0} superseded, ${s.skipped || 0} skipped`,
        detail: { runId: run.id, fileMode: run.fileMode, fileName: run.fileName, uploadedBy: run.runBy.displayName, committedBy: committer, ...s },
      });
    } else if (run.status === "cancelled") {
      events.push({
        type: "contract_update_cancelled",
        timestamp: run.createdAt.toISOString(),
        user: run.runBy.displayName,
        summary: `Contract update cancelled (${run.fileName})`,
        detail: { runId: run.id },
      });
    } else {
      events.push({
        type: "contract_update_staged",
        timestamp: run.createdAt.toISOString(),
        user: run.runBy.displayName,
        summary: `Contract update staged: ${run.changedCount} changed, ${run.addedCount} added, ${run.removedCount} removed`,
        detail: { runId: run.id, fileMode: run.fileMode, fileName: run.fileName, status: run.status },
      });
    }
  }

  for (const run of reconRuns) {
    const period = `${run.claimPeriodStart.toISOString().split("T")[0]} – ${run.claimPeriodEnd.toISOString().split("T")[0]}`;
    if (run.status === "committed" && run.commitSummary) {
      const s = run.commitSummary as Record<string, unknown>;
      events.push({
        type: "reconciliation_committed",
        timestamp: (run.completedAt ?? run.startedAt).toISOString(),
        user: run.runBy.displayName,
        summary: `Claim reconciliation committed (${period}): ${s.totalApproved || 0} approved`,
        detail: { runId: run.id, ...s },
      });
    } else {
      events.push({
        type: "reconciliation_review",
        timestamp: run.startedAt.toISOString(),
        user: run.runBy.displayName,
        summary: `Claim reconciliation ${run.status} (${period}): ${run.exceptionCount} exceptions`,
        detail: { runId: run.id, status: run.status, exceptions: run.exceptionCount },
      });
    }
  }

  for (const entry of recordAudit) {
    const fields = entry.changedFields as Record<string, unknown>;
    events.push({
      type: "record_change",
      timestamp: entry.createdAt.toISOString(),
      user: entry.user.displayName,
      summary: `Record #${entry.recordId} ${entry.action.toLowerCase()}`,
      detail: { action: entry.action, recordId: entry.recordId, changedFields: fields },
    });
  }

  // Sort by timestamp descending and trim
  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return events.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Disputes: compose run-grouped result
// ---------------------------------------------------------------------------

export async function getContractDisputes(
  contractNumber: string,
  distributorId: number,
  limit: number,
): Promise<DisputeResult> {
  const claimRows = await prisma.claimRow.findMany({
    where: {
      contractNumber,
      batch: { distributorId },
    },
    select: { id: true, batchId: true },
  });

  const claimRowIds = claimRows.map((r) => r.id);

  if (claimRowIds.length === 0) {
    return { runs: [], totalIssues: 0, bySeverity: {}, byCode: {} };
  }

  const batchIds = [...new Set(claimRows.map((r) => r.batchId))];

  const reconRuns = await prisma.reconciliationRun.findMany({
    where: { claimBatchId: { in: batchIds } },
    select: {
      id: true,
      claimPeriodStart: true,
      claimPeriodEnd: true,
      status: true,
      startedAt: true,
    },
    orderBy: { startedAt: "desc" },
    take: limit,
  });

  if (reconRuns.length === 0) {
    return { runs: [], totalIssues: 0, bySeverity: {}, byCode: {} };
  }

  const runIds = reconRuns.map((r) => r.id);

  const issues = await prisma.reconciliationIssue.findMany({
    where: {
      reconciliationRunId: { in: runIds },
      claimRowId: { in: claimRowIds },
    },
  });

  const issuesByRun = new Map<number, typeof issues>();
  for (const issue of issues) {
    const list = issuesByRun.get(issue.reconciliationRunId) || [];
    list.push(issue);
    issuesByRun.set(issue.reconciliationRunId, list);
  }

  const runs = reconRuns
    .filter((r) => issuesByRun.has(r.id))
    .map((r) => {
      const runIssues = issuesByRun.get(r.id) || [];
      const start = r.claimPeriodStart.toISOString().split("T")[0];
      const end = r.claimPeriodEnd.toISOString().split("T")[0];
      return {
        runId: r.id,
        claimPeriod: `${start} – ${end}`,
        runStatus: r.status,
        runDate: r.startedAt.toISOString(),
        issues: runIssues.map((i) => ({
          id: i.id,
          code: i.code,
          severity: i.severity,
          category: i.category,
          description: i.description,
          resolution: i.resolution,
        })),
      };
    });

  const totalIssues = issues.length;
  const bySeverity: Record<string, number> = {};
  const byCode: Record<string, number> = {};
  for (const issue of issues) {
    bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
    byCode[issue.code] = (byCode[issue.code] || 0) + 1;
  }

  return { runs, totalIssues, bySeverity, byCode };
}
