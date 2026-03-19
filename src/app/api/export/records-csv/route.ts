import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { buildStatusWhere } from "@/lib/records/status-filter";

export const dynamic = "force-dynamic";

/**
 * Build a Prisma WHERE clause from export query params.
 * Mirrors the filter logic from the Records page server component.
 */
function buildExportWhere(params: URLSearchParams): Prisma.RebateRecordWhereInput {
  const conditions: Prisma.RebateRecordWhereInput[] = [];

  const planWhere: Prisma.RebatePlanWhereInput = {};
  const contractWhere: Prisma.ContractWhereInput = {};
  let hasContractFilter = false;
  let hasPlanFilter = false;

  const distributor = params.get("distributor");
  if (distributor) {
    contractWhere.distributor = { code: distributor };
    hasContractFilter = true;
  }

  const endUserCode = params.get("endUserCode");
  const endUser = params.get("endUser");
  if (endUserCode) {
    contractWhere.endUser = { code: endUserCode };
    hasContractFilter = true;
  } else if (endUser) {
    contractWhere.endUser = { name: endUser };
    hasContractFilter = true;
  }

  const contract = params.get("contract");
  if (contract) {
    contractWhere.contractNumber = contract;
    hasContractFilter = true;
  }

  if (hasContractFilter) {
    planWhere.contract = contractWhere;
    hasPlanFilter = true;
  }

  const plan = params.get("plan");
  if (plan) {
    planWhere.planCode = plan;
    hasPlanFilter = true;
  }

  if (hasPlanFilter) {
    conditions.push({ rebatePlan: planWhere });
  }

  const status = params.get("status");
  if (status) {
    conditions.push(buildStatusWhere(status));
  }

  const dateFrom = params.get("dateFrom");
  if (dateFrom) {
    conditions.push({ startDate: { gte: new Date(dateFrom) } });
  }

  const dateTo = params.get("dateTo");
  if (dateTo) {
    conditions.push({ endDate: { lte: new Date(dateTo) } });
  }

  const search = params.get("search");
  if (search) {
    conditions.push({
      OR: [
        { item: { itemNumber: { contains: search, mode: "insensitive" } } },
        { rebatePlan: { planCode: { contains: search, mode: "insensitive" } } },
        { rebatePlan: { contract: { contractNumber: { contains: search, mode: "insensitive" } } } },
      ],
    });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

/**
 * GET /api/export/records-csv
 *
 * Exports rebate records as a flat, denormalized CSV file.
 * Supports the same filter params as the Records page:
 *   distributor, contract, plan, endUser, status, dateFrom, dateTo, search
 * If no filters are provided, exports all records.
 */
export async function GET(request: NextRequest) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;

  const { searchParams } = new URL(request.url);
  const where = buildExportWhere(searchParams);

  const records = await prisma.rebateRecord.findMany({
    where,
    include: {
      rebatePlan: {
        select: {
          planCode: true,
          contract: {
            select: {
              contractNumber: true,
              distributor: { select: { code: true } },
              endUser: { select: { name: true } },
            },
          },
        },
      },
      item: { select: { itemNumber: true } },
    },
    orderBy: [{ rebatePlanId: "asc" }, { startDate: "asc" }],
  });

  // Available columns — order matters for default output
  const allColumns: { key: string; header: string; getValue: (r: typeof records[0]) => string | number }[] = [
    { key: "item", header: "Item #", getValue: (r) => csvEscape(r.item.itemNumber) },
    { key: "price", header: "Rebate Price", getValue: (r) => Number(r.rebatePrice) },
    { key: "distributor", header: "Distributor", getValue: (r) => csvEscape(r.rebatePlan.contract.distributor.code) },
    { key: "contract", header: "Contract #", getValue: (r) => csvEscape(r.rebatePlan.contract.contractNumber) },
    { key: "endUser", header: "End User", getValue: (r) => csvEscape(r.rebatePlan.contract.endUser?.name ?? "") },
    { key: "plan", header: "Plan Code", getValue: (r) => csvEscape(r.rebatePlan.planCode) },
    { key: "startDate", header: "Start Date", getValue: (r) => r.startDate.toISOString().split("T")[0] },
    { key: "endDate", header: "End Date", getValue: (r) => r.endDate ? r.endDate.toISOString().split("T")[0] : "" },
    { key: "status", header: "Status", getValue: (r) => r.status },
    { key: "id", header: "ID", getValue: (r) => r.id },
    { key: "createdAt", header: "Created At", getValue: (r) => r.createdAt.toISOString() },
    { key: "updatedAt", header: "Updated At", getValue: (r) => r.updatedAt.toISOString() },
  ];

  // Default columns: Item # and Rebate Price
  const defaultColumns = ["item", "price"];
  const requestedColumns = searchParams.get("columns")?.split(",").filter(Boolean);
  const selectedKeys = requestedColumns && requestedColumns.length > 0 ? requestedColumns : defaultColumns;
  const columns = allColumns.filter((c) => selectedKeys.includes(c.key));

  // If no valid columns matched, fall back to defaults
  if (columns.length === 0) {
    columns.push(...allColumns.filter((c) => defaultColumns.includes(c.key)));
  }

  const headers = columns.map((c) => c.header);
  const lines: string[] = [headers.join(",")];

  for (const r of records) {
    const row = columns.map((c) => c.getValue(r));
    lines.push(row.join(","));
  }

  const csv = lines.join("\n");
  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `rms-records-export-${dateStr}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/**
 * Escape a value for CSV. Wraps in quotes if the value contains
 * commas, quotes, or newlines. Doubles internal quotes per RFC 4180.
 */
function csvEscape(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
