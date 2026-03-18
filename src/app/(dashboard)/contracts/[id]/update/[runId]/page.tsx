import { prisma } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { ContractUpdateReviewClient } from "@/components/contracts/contract-update-review-client";

export const dynamic = "force-dynamic";

export default async function ContractUpdateReviewPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const contractId = parseInt(id, 10);
  const updateRunId = parseInt(runId, 10);
  if (isNaN(contractId) || isNaN(updateRunId)) notFound();

  const run = await prisma.contractUpdateRun.findUnique({
    where: { id: updateRunId },
    include: {
      contract: {
        select: {
          id: true,
          contractNumber: true,
          contractType: true,
          distributor: { select: { code: true, name: true } },
          endUser: { select: { name: true } },
        },
      },
      runBy: { select: { displayName: true } },
      diffs: {
        orderBy: [{ diffType: "asc" }, { itemNumber: "asc" }],
      },
    },
  });

  if (!run || run.contractId !== contractId) notFound();

  // Load active plans for ambiguous diff disambiguation
  const plans = await prisma.rebatePlan.findMany({
    where: { contractId, status: "active" },
    select: { id: true, planCode: true, planName: true },
    orderBy: { planCode: "asc" },
  });

  const serializedDiffs = run.diffs.map((d) => ({
    id: d.id,
    diffType: d.diffType,
    itemId: d.itemId,
    itemNumber: d.itemNumber,
    rebatePlanId: d.rebatePlanId,
    planCode: d.planCode,
    matchedRecordId: d.matchedRecordId,
    oldPrice: d.oldPrice ? Number(d.oldPrice) : null,
    newPrice: d.newPrice ? Number(d.newPrice) : null,
    matchStatus: d.matchStatus,
    ambiguityReason: d.ambiguityReason,
    resolution: d.resolution,
    resolutionData: d.resolutionData as Record<string, unknown> | null,
    resolvedAt: d.resolvedAt?.toISOString() ?? null,
    committedRecordId: d.committedRecordId,
  }));

  return (
    <ContractUpdateReviewClient
      run={{
        id: run.id,
        contractId: run.contractId,
        fileMode: run.fileMode,
        fileName: run.fileName,
        effectiveDate: run.effectiveDate?.toISOString().split("T")[0] ?? null,
        status: run.status,
        totalRows: run.totalRows,
        unchangedCount: run.unchangedCount,
        changedCount: run.changedCount,
        addedCount: run.addedCount,
        removedCount: run.removedCount,
        commitSummary: run.commitSummary as Record<string, unknown> | null,
        runBy: run.runBy.displayName,
        createdAt: run.createdAt.toISOString(),
        committedAt: run.committedAt?.toISOString() ?? null,
      }}
      contract={{
        id: run.contract.id,
        contractNumber: run.contract.contractNumber,
        contractType: run.contract.contractType,
        distributor: run.contract.distributor,
        endUser: run.contract.endUser,
      }}
      diffs={serializedDiffs}
      plans={plans}
    />
  );
}
