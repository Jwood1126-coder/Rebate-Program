/**
 * GET /api/dashboard/contracts?year=2026&month=3
 *
 * Returns all contracts with their reconciliation and update status
 * for a given period. Used by the dashboard contract status table.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { getBatchReconStatus, getBatchUpdateStatus } from "@/lib/contracts/reconciliation-status.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()), 10);
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1), 10);

  // Build period boundaries
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0); // last day of month

  // Load all active/pending contracts
  const contracts = await prisma.contract.findMany({
    where: { status: { notIn: ["cancelled"] } },
    select: {
      id: true,
      contractNumber: true,
      customerNumber: true,
      contractType: true,
      status: true,
      startDate: true,
      endDate: true,
      lastReviewedAt: true,
      distributorId: true,
      distributor: { select: { code: true, name: true } },
      endUser: { select: { code: true, name: true } },
      _count: {
        select: {
          rebatePlans: {
            where: { rebateRecords: { some: { status: { notIn: ["cancelled", "superseded"] } } } },
          },
        },
      },
    },
    orderBy: [{ distributor: { code: "asc" } }, { contractNumber: "asc" }],
  });

  // Get record counts per contract efficiently
  const contractIds = contracts.map((c) => c.id);
  const recordCounts = await prisma.rebateRecord.groupBy({
    by: ["rebatePlanId"],
    where: {
      rebatePlan: { contractId: { in: contractIds } },
      status: { notIn: ["cancelled", "superseded"] },
    },
    _count: true,
  });

  // Map planId → contractId for counting
  const plans = await prisma.rebatePlan.findMany({
    where: { contractId: { in: contractIds } },
    select: { id: true, contractId: true },
  });
  const planToContract = new Map(plans.map((p) => [p.id, p.contractId]));

  const recordCountByContract = new Map<number, number>();
  for (const rc of recordCounts) {
    const contractId = planToContract.get(rc.rebatePlanId);
    if (contractId) {
      recordCountByContract.set(contractId, (recordCountByContract.get(contractId) || 0) + rc._count);
    }
  }

  // Batch reconciliation + update status
  const contractsForRecon = contracts.map((c) => ({
    id: c.id,
    contractNumber: c.contractNumber,
    distributorId: c.distributorId,
  }));

  const [reconStatusMap, updateStatusMap] = await Promise.all([
    getBatchReconStatus(contractsForRecon, periodStart, periodEnd),
    getBatchUpdateStatus(contractIds),
  ]);

  // Also get "all time" recon status (not period-filtered) for "last reconciled" display
  const allTimeReconMap = await getBatchReconStatus(contractsForRecon);

  // Compose response
  const rows = contracts.map((c) => {
    const recon = reconStatusMap.get(c.id);
    const allTimeRecon = allTimeReconMap.get(c.id);
    const update = updateStatusMap.get(c.id);
    const records = recordCountByContract.get(c.id) || 0;

    return {
      id: c.id,
      contractNumber: c.contractNumber,
      customerNumber: c.customerNumber,
      contractType: c.contractType,
      contractStatus: c.status,
      distributor: c.distributor,
      endUser: c.endUser,
      recordCount: records,
      lastReviewedAt: c.lastReviewedAt?.toISOString() ?? null,
      // Period-specific recon
      periodReconState: recon?.reconState ?? "never",
      periodOpenRunId: recon?.openRunId ?? null,
      periodOpenRunStatus: recon?.openRunStatus ?? null,
      // All-time recon
      lastReconciledAt: allTimeRecon?.lastCommittedAt ?? null,
      lastClaimPeriod: allTimeRecon?.lastClaimPeriod ?? null,
      // Update status
      lastUpdatedAt: update?.lastCommittedAt ?? null,
      updateChanges: update ? update.changedCount + update.addedCount + update.removedCount : 0,
    };
  });

  return NextResponse.json({
    period: { year, month, label: periodStart.toLocaleDateString("en-US", { month: "long", year: "numeric" }) },
    contracts: rows,
    summary: {
      total: rows.length,
      reconciled: rows.filter((r) => r.periodReconState === "reconciled").length,
      inProgress: rows.filter((r) => r.periodReconState === "in_progress").length,
      notReconciled: rows.filter((r) => r.periodReconState === "never").length,
      pendingReview: rows.filter((r) => r.contractStatus === "pending_review").length,
    },
  });
}
