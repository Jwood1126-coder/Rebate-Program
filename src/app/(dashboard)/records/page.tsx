import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";
import { deriveRecordStatus } from "@/lib/utils/dates";
import { buildStatusWhere } from "@/lib/records/status-filter";
import { RecordsPageClient } from "@/components/records/records-page-client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

function formatDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

interface SearchParams {
  distributor?: string;
  contract?: string;
  plan?: string;
  endUser?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: string;
}

/**
 * Build a Prisma WHERE clause from URL search params.
 * All filtering happens server-side — no silent truncation.
 * Uses AND array to safely combine independent filter conditions.
 */
function buildWhere(params: SearchParams): Prisma.RebateRecordWhereInput {
  const conditions: Prisma.RebateRecordWhereInput[] = [];

  // --- Entity filters (nested through plan → contract → distributor/endUser) ---
  const planWhere: Prisma.RebatePlanWhereInput = {};
  const contractWhere: Prisma.ContractWhereInput = {};
  let hasContractFilter = false;
  let hasPlanFilter = false;

  if (params.distributor) {
    contractWhere.distributor = { code: params.distributor };
    hasContractFilter = true;
  }

  if (params.endUser) {
    contractWhere.endUser = { name: params.endUser };
    hasContractFilter = true;
  }

  if (params.contract) {
    contractWhere.contractNumber = params.contract;
    hasContractFilter = true;
  }

  if (hasContractFilter) {
    planWhere.contract = contractWhere;
    hasPlanFilter = true;
  }

  if (params.plan) {
    planWhere.planCode = params.plan;
    hasPlanFilter = true;
  }

  if (hasPlanFilter) {
    conditions.push({ rebatePlan: planWhere });
  }

  // --- Derived status filter ---
  if (params.status) {
    conditions.push(buildStatusWhere(params.status));
  }

  // --- Date range filters ---
  if (params.dateFrom) {
    conditions.push({ startDate: { gte: new Date(params.dateFrom) } });
  }

  if (params.dateTo) {
    conditions.push({ endDate: { lte: new Date(params.dateTo) } });
  }

  // --- Text search ---
  if (params.search) {
    const q = params.search;
    conditions.push({
      OR: [
        { item: { itemNumber: { contains: q, mode: "insensitive" } } },
        { rebatePlan: { planCode: { contains: q, mode: "insensitive" } } },
        { rebatePlan: { contract: { contractNumber: { contains: q, mode: "insensitive" } } } },
        { rebatePlan: { contract: { distributor: { code: { contains: q, mode: "insensitive" } } } } },
        { rebatePlan: { contract: { endUser: { name: { contains: q, mode: "insensitive" } } } } },
      ],
    });
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { AND: conditions };
}

/**
 * Fetch distinct values for filter dropdowns.
 * Each query is lightweight — just the distinct values for one dimension.
 */
async function getFilterOptions() {
  const [distributors, contracts, plans, endUsers] = await Promise.all([
    prisma.distributor.findMany({
      where: { isActive: true },
      select: { code: true },
      orderBy: { code: "asc" },
    }),
    prisma.contract.findMany({
      select: { contractNumber: true },
      orderBy: { contractNumber: "asc" },
      distinct: ["contractNumber"],
    }),
    prisma.rebatePlan.findMany({
      select: { planCode: true },
      orderBy: { planCode: "asc" },
      distinct: ["planCode"],
    }),
    prisma.endUser.findMany({
      where: { isActive: true },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    distributors: distributors.map((d) => d.code),
    contracts: contracts.map((c) => c.contractNumber),
    plans: plans.map((p) => p.planCode),
    endUsers: endUsers.map((u) => u.name),
    statuses: ["active", "expired", "future", "superseded", "draft", "cancelled"],
  };
}

// Primary operational workspace — all rebate records with server-side filtering + pagination
export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const where = buildWhere(params);

  const [rawRecords, totalCount, filterOptions] = await Promise.all([
    prisma.rebateRecord.findMany({
      where,
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
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.rebateRecord.count({ where }),
    getFilterOptions(),
  ]);

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

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <RecordsPageClient
        records={records}
        totalCount={totalCount}
        page={page}
        pageSize={PAGE_SIZE}
        totalPages={totalPages}
        filterOptions={filterOptions}
      />
    </div>
  );
}
