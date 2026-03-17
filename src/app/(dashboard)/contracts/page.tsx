import { prisma } from "@/lib/db/client";
import { Prisma } from "@prisma/client";
import { ContractsPageClient } from "@/components/contracts/contracts-page-client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface SearchParams {
  distributor?: string;
  endUser?: string;
  status?: string;
  search?: string;
  page?: string;
}

function buildWhere(params: SearchParams): Prisma.ContractWhereInput {
  const conditions: Prisma.ContractWhereInput[] = [];

  if (params.distributor) {
    conditions.push({ distributor: { code: params.distributor } });
  }

  if (params.endUser) {
    conditions.push({ endUser: { name: params.endUser } });
  }

  if (params.status) {
    conditions.push({ status: params.status });
  }

  if (params.search) {
    const q = params.search;
    conditions.push({
      OR: [
        { contractNumber: { contains: q, mode: "insensitive" } },
        { distributor: { code: { contains: q, mode: "insensitive" } } },
        { distributor: { name: { contains: q, mode: "insensitive" } } },
        { endUser: { name: { contains: q, mode: "insensitive" } } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { AND: conditions };
}

/**
 * Compute cascading filter options: each dropdown shows values available
 * given the other active filters.
 */
async function getFilterOptions(params: SearchParams) {
  // Build WHERE excluding each filter dimension for cascading
  function buildExcluding(exclude: keyof SearchParams): Prisma.ContractWhereInput {
    const copy = { ...params, [exclude]: undefined };
    return buildWhere(copy);
  }

  const [distributors, endUsers, statuses] = await Promise.all([
    prisma.distributor.findMany({
      where: {
        isActive: true,
        contracts: { some: buildExcluding("distributor") },
      },
      select: { code: true },
      orderBy: { code: "asc" },
    }),
    prisma.endUser.findMany({
      where: {
        isActive: true,
        contracts: { some: buildExcluding("endUser") },
      },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
    prisma.contract.groupBy({
      by: ["status"],
      where: buildExcluding("status"),
      orderBy: { status: "asc" },
    }),
  ]);

  return {
    distributors: distributors.map((d) => d.code),
    endUsers: endUsers.map((u) => u.name),
    statuses: statuses.map((s) => s.status),
  };
}

function formatDate(d: Date | null): string {
  if (!d) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const where = buildWhere(params);

  const [rawContracts, totalCount, filterOptions] = await Promise.all([
    prisma.contract.findMany({
      where,
      include: {
        distributor: { select: { id: true, code: true, name: true } },
        endUser: { select: { id: true, name: true } },
        _count: {
          select: {
            rebatePlans: true,
          },
        },
        rebatePlans: {
          select: {
            _count: { select: { rebateRecords: true } },
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.contract.count({ where }),
    getFilterOptions(params),
  ]);

  const contracts = rawContracts.map((c) => ({
    id: c.id,
    contractNumber: c.contractNumber,
    distributor: c.distributor.code,
    distributorName: c.distributor.name,
    endUser: c.endUser.name,
    startDate: formatDate(c.startDate),
    endDate: formatDate(c.endDate),
    status: c.status,
    planCount: c._count.rebatePlans,
    recordCount: c.rebatePlans.reduce((sum, p) => sum + p._count.rebateRecords, 0),
    updatedAt: c.updatedAt.toISOString(),
    description: c.description,
  }));

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <ContractsPageClient
        contracts={contracts}
        totalCount={totalCount}
        page={page}
        pageSize={PAGE_SIZE}
        totalPages={totalPages}
        filterOptions={filterOptions}
      />
    </div>
  );
}
