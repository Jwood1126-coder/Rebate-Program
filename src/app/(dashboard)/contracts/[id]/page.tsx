import { prisma } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { deriveRecordStatus } from "@/lib/utils/dates";
import { ContractDetailClient } from "@/components/contracts/contract-detail-client";

export const dynamic = "force-dynamic";

function formatDate(d: Date | null): string {
  if (!d) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contractId = parseInt(id, 10);
  if (isNaN(contractId)) notFound();

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      distributor: { select: { id: true, code: true, name: true } },
      endUser: { select: { id: true, code: true, name: true } },
      rebatePlans: {
        include: {
          rebateRecords: {
            include: {
              item: { select: { itemNumber: true, description: true } },
            },
            orderBy: [{ startDate: "asc" }, { item: { itemNumber: "asc" } }],
          },
        },
        orderBy: { planCode: "asc" },
      },
    },
  });

  if (!contract) notFound();

  // Shape data for client
  const plans = contract.rebatePlans.map((p) => ({
    id: p.id,
    planCode: p.planCode,
    planName: p.planName,
    discountType: p.discountType,
    status: p.status,
    records: p.rebateRecords.map((r) => ({
      id: r.id,
      itemNumber: r.item.itemNumber,
      itemDescription: r.item.description,
      rebatePrice: r.rebatePrice.toString(),
      startDate: formatDate(r.startDate),
      endDate: r.endDate ? formatDate(r.endDate) : "",
      rawStartDate: r.startDate.toISOString().split("T")[0],
      rawEndDate: r.endDate ? r.endDate.toISOString().split("T")[0] : null,
      status: deriveRecordStatus(r.startDate, r.endDate, r.supersededById, r.status),
      updatedAt: formatDate(r.updatedAt),
    })),
  }));

  // Compute summary stats
  const allRecords = plans.flatMap((p) => p.records);
  const statusCounts: Record<string, number> = {};
  for (const r of allRecords) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  }

  // Find last reconciliation run that touched this contract
  const planIds = contract.rebatePlans.map((p) => p.id);
  const recordIds = planIds.length > 0
    ? await prisma.rebateRecord.findMany({
        where: { rebatePlanId: { in: planIds } },
        select: { id: true },
      }).then((recs) => recs.map((r) => r.id))
    : [];

  let lastReconRun: { id: number; status: string; claimPeriodStart: Date; claimPeriodEnd: Date; completedAt: Date | null; startedAt: Date } | null = null;
  if (recordIds.length > 0) {
    // Find runs that had issues referencing this contract's records
    lastReconRun = await prisma.reconciliationRun.findFirst({
      where: {
        status: "committed",
        issues: {
          some: {
            OR: [
              { masterRecordId: { in: recordIds } },
              { committedRecordId: { in: recordIds } },
            ],
          },
        },
      },
      orderBy: { completedAt: "desc" },
      select: { id: true, status: true, claimPeriodStart: true, claimPeriodEnd: true, completedAt: true, startedAt: true },
    });
  }
  // Also check by claim row contract number (covers runs where claims matched this contract)
  if (!lastReconRun) {
    const claimRow = await prisma.claimRow.findFirst({
      where: {
        contractNumber: contract.contractNumber,
        batch: { distributorId: contract.distributorId },
      },
      orderBy: { id: "desc" },
      select: { batch: { select: { id: true } } },
    });
    if (claimRow) {
      lastReconRun = await prisma.reconciliationRun.findFirst({
        where: {
          claimBatchId: claimRow.batch.id,
          status: "committed",
        },
        orderBy: { completedAt: "desc" },
        select: { id: true, status: true, claimPeriodStart: true, claimPeriodEnd: true, completedAt: true, startedAt: true },
      });
    }
  }

  // Load end users for edit dropdown
  const endUsers = await prisma.endUser.findMany({
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  // Find last contract update run
  const lastUpdateRun = await prisma.contractUpdateRun.findFirst({
    where: { contractId, status: "committed" },
    orderBy: { committedAt: "desc" },
    select: { id: true, status: true, committedAt: true, fileName: true, changedCount: true, addedCount: true, removedCount: true },
  });

  const reconHistory = lastReconRun ? {
    runId: lastReconRun.id,
    status: lastReconRun.status,
    claimPeriod: `${formatDate(lastReconRun.claimPeriodStart)} – ${formatDate(lastReconRun.claimPeriodEnd)}`,
    completedAt: (lastReconRun.completedAt ?? lastReconRun.startedAt).toISOString(),
  } : null;

  const updateHistory = lastUpdateRun ? {
    runId: lastUpdateRun.id,
    committedAt: lastUpdateRun.committedAt?.toISOString() ?? null,
    fileName: lastUpdateRun.fileName,
    changedCount: lastUpdateRun.changedCount,
    addedCount: lastUpdateRun.addedCount,
    removedCount: lastUpdateRun.removedCount,
  } : null;

  return (
    <ContractDetailClient
      contract={{
        id: contract.id,
        contractNumber: contract.contractNumber,
        customerNumber: contract.customerNumber,
        description: contract.description,
        contractType: contract.contractType,
        startDate: formatDate(contract.startDate),
        endDate: formatDate(contract.endDate),
        noticePeriodDays: contract.noticePeriodDays,
        lastReviewedAt: contract.lastReviewedAt?.toISOString() ?? null,
        status: contract.status,
        updatedAt: contract.updatedAt.toISOString(),
        distributor: {
          code: contract.distributor.code,
          name: contract.distributor.name,
        },
        endUser: {
          name: contract.endUser.name,
          code: contract.endUser.code,
        },
      }}
      plans={plans}
      totalRecords={allRecords.length}
      statusCounts={statusCounts}
      lastReconciliation={reconHistory}
      lastUpdate={updateHistory}
      endUsers={endUsers}
    />
  );
}
