import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/reconciliation/queue?period=2026-02
 *
 * Returns the reconciliation status for each active distributor for a given period.
 * Shows which distributors have submitted claims, which need validation, which are
 * in review, and which are complete — forming a checklist for the operator.
 */
export async function GET(request: Request) {
  const sessionResult = await getSessionUser();
  if ("error" in sessionResult) return sessionResult.error;

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period"); // e.g., "2026-02"

  // Default to current month
  const now = new Date();
  const year = period ? parseInt(period.split("-")[0]) : now.getFullYear();
  const month = period ? parseInt(period.split("-")[1]) : now.getMonth() + 1;

  // Compute period boundaries
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0)); // Last day of month

  // Get all active distributors that have at least one contract with records
  const distributors = await prisma.distributor.findMany({
    where: { isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      _count: { select: { contracts: true } },
    },
    orderBy: { code: "asc" },
  });

  // Get all reconciliation runs for this period
  const runs = await prisma.reconciliationRun.findMany({
    where: {
      claimPeriodStart: { gte: periodStart },
      claimPeriodEnd: { lte: new Date(Date.UTC(year, month, 0, 23, 59, 59)) },
      status: { not: "cancelled" },
    },
    include: {
      distributor: { select: { code: true } },
      claimBatch: { select: { fileName: true, totalRows: true, validRows: true } },
      runBy: { select: { displayName: true } },
      _count: { select: { issues: true } },
    },
    orderBy: { startedAt: "desc" },
  });

  // Get unresolved issue counts per run
  const runIds = runs.map((r) => r.id);
  const unresolvedCounts = runIds.length > 0
    ? await prisma.reconciliationIssue.groupBy({
        by: ["reconciliationRunId"],
        where: {
          reconciliationRunId: { in: runIds },
          resolution: null,
        },
        _count: true,
      })
    : [];

  const unresolvedMap = new Map(
    unresolvedCounts.map((u) => [u.reconciliationRunId, u._count])
  );

  // Build per-distributor status
  type QueueItem = {
    distributorId: number;
    distributorCode: string;
    distributorName: string;
    hasContracts: boolean;
    status: "not_submitted" | "staged" | "needs_validation" | "in_review" | "reviewed" | "committed";
    run: {
      id: number;
      status: string;
      fileName: string | null;
      totalRows: number;
      validatedCount: number;
      exceptionCount: number;
      unresolvedCount: number;
      startedAt: string;
      runBy: string;
    } | null;
  };

  const queue: QueueItem[] = distributors.map((d) => {
    // Find the most recent non-cancelled run for this distributor in this period
    const run = runs.find((r) => r.distributor.code === d.code);

    if (!run) {
      return {
        distributorId: d.id,
        distributorCode: d.code,
        distributorName: d.name,
        hasContracts: d._count.contracts > 0,
        status: "not_submitted" as const,
        run: null,
      };
    }

    const unresolvedCount = unresolvedMap.get(run.id) ?? 0;

    let status: QueueItem["status"];
    if (run.status === "committed") {
      status = "committed";
    } else if (run.status === "completed" || run.status === "reviewed") {
      status = "reviewed";
    } else if (run.status === "review") {
      status = "in_review";
    } else if (run.status === "staged") {
      status = "needs_validation";
    } else {
      // draft, running, etc.
      status = "staged";
    }

    return {
      distributorId: d.id,
      distributorCode: d.code,
      distributorName: d.name,
      hasContracts: d._count.contracts > 0,
      status,
      run: {
        id: run.id,
        status: run.status,
        fileName: run.claimBatch?.fileName ?? null,
        totalRows: run.totalClaimLines,
        validatedCount: run.validatedCount,
        exceptionCount: run.exceptionCount,
        unresolvedCount,
        startedAt: run.startedAt.toISOString(),
        runBy: run.runBy.displayName,
      },
    };
  });

  // Summary counts
  const summary = {
    period: `${year}-${String(month).padStart(2, "0")}`,
    periodLabel: periodStart.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    totalDistributors: queue.filter((q) => q.hasContracts).length,
    notSubmitted: queue.filter((q) => q.hasContracts && q.status === "not_submitted").length,
    needsValidation: queue.filter((q) => q.status === "needs_validation" || q.status === "reviewed").length,
    inReview: queue.filter((q) => q.status === "in_review").length,
    completed: queue.filter((q) => q.status === "committed").length,
  };

  return NextResponse.json({ summary, queue });
}
