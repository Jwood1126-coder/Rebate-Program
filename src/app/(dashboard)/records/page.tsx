import { prisma } from "@/lib/db/client";
import { deriveRecordStatus } from "@/lib/utils/dates";
import { RecordsPageClient } from "@/components/records/records-page-client";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

// Primary operational workspace — all rebate records with full filtering
export default async function RecordsPage() {
  const rawRecords = await prisma.rebateRecord.findMany({
    include: {
      rebatePlan: {
        include: {
          contract: {
            include: {
              distributor: true,
              endUser: true,
            },
          },
        },
      },
      item: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const records = rawRecords.map((r) => ({
    id: r.id,
    distributor: r.rebatePlan.contract.distributor.code,
    distributorId: r.rebatePlan.contract.distributor.id,
    contractNumber: r.rebatePlan.contract.contractNumber,
    contractId: r.rebatePlan.contract.id,
    planCode: r.rebatePlan.planCode,
    planId: r.rebatePlan.id,
    endUser: r.rebatePlan.contract.endUser.name,
    endUserId: r.rebatePlan.contract.endUser.id,
    itemNumber: r.item.itemNumber,
    itemId: r.itemId,
    rebatePrice: r.rebatePrice.toString(),
    startDate: formatDate(r.startDate),
    endDate: r.endDate ? formatDate(r.endDate) : "",
    status: deriveRecordStatus(
      r.startDate,
      r.endDate,
      r.supersededById,
      r.status
    ),
    rebatePlanId: r.rebatePlanId,
    rawStartDate: r.startDate.toISOString().split("T")[0],
    rawEndDate: r.endDate ? r.endDate.toISOString().split("T")[0] : null,
  }));

  return (
    <div className="space-y-4">
      <RecordsPageClient
        records={records}
        totalCount={rawRecords.length}
      />
    </div>
  );
}
