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
    })),
  }));

  // Compute summary stats
  const allRecords = plans.flatMap((p) => p.records);
  const statusCounts: Record<string, number> = {};
  for (const r of allRecords) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  }

  return (
    <ContractDetailClient
      contract={{
        id: contract.id,
        contractNumber: contract.contractNumber,
        description: contract.description,
        startDate: formatDate(contract.startDate),
        endDate: formatDate(contract.endDate),
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
    />
  );
}
