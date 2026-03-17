import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/export/records-csv
 *
 * Exports all rebate records as a flat, denormalized CSV file.
 * This is the "manual spreadsheet fallback" -- if the system is partially
 * broken, this single endpoint gives staff their data in a universally
 * readable format.
 *
 * Columns mirror the Rebate Records sheet from the full export:
 *   ID, Plan Code, Contract Number, Distributor Code, Item Number,
 *   Rebate Price, Start Date, End Date, Status, Created At, Updated At
 */
export async function GET() {
  const result = await getSessionUser();
  if ("error" in result) return result.error;

  const records = await prisma.rebateRecord.findMany({
    include: {
      rebatePlan: {
        select: {
          planCode: true,
          contract: {
            select: {
              contractNumber: true,
              distributor: { select: { code: true } },
            },
          },
        },
      },
      item: { select: { itemNumber: true } },
    },
    orderBy: [{ rebatePlanId: "asc" }, { startDate: "asc" }],
  });

  // Build CSV
  const headers = [
    "ID",
    "Plan Code",
    "Contract Number",
    "Distributor Code",
    "Item Number",
    "Rebate Price",
    "Start Date",
    "End Date",
    "Status",
    "Created At",
    "Updated At",
  ];

  const lines: string[] = [headers.join(",")];

  for (const r of records) {
    const row = [
      r.id,
      csvEscape(r.rebatePlan.planCode),
      csvEscape(r.rebatePlan.contract.contractNumber),
      csvEscape(r.rebatePlan.contract.distributor.code),
      csvEscape(r.item.itemNumber),
      Number(r.rebatePrice),
      r.startDate.toISOString().split("T")[0],
      r.endDate ? r.endDate.toISOString().split("T")[0] : "",
      r.status,
      r.createdAt.toISOString(),
      r.updatedAt.toISOString(),
    ];
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
