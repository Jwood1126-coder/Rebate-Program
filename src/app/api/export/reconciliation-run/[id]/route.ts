// GET /api/export/reconciliation-run/:id — Clean exceptions-only CSV export.
//
// Simple, focused export of just the exception items found during reconciliation.
// Designed for quick internal review — not the full claim response report.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionResult = await getSessionUser();
  if ("error" in sessionResult) return sessionResult.error;

  const { id } = await params;
  const runId = parseInt(id);
  if (isNaN(runId)) {
    return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
  }

  const run = await prisma.reconciliationRun.findUnique({
    where: { id: runId },
    include: {
      distributor: true,
      runBy: { select: { displayName: true } },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (!["review", "reviewed", "committed"].includes(run.status)) {
    return NextResponse.json(
      { error: "Run must be at least in review status to export" },
      { status: 400 }
    );
  }

  const issues = await prisma.reconciliationIssue.findMany({
    where: { reconciliationRunId: runId },
    include: {
      resolvedBy: { select: { displayName: true } },
    },
    orderBy: [{ claimRowId: "asc" }, { code: "asc" }],
  });

  if (issues.length === 0) {
    return new NextResponse("No exceptions found for this run.", {
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Fetch claim rows for item/contract context
  const claimRowIds = [
    ...new Set(
      issues.map((i) => i.claimRowId).filter((id): id is number => id !== null)
    ),
  ];
  const claimRowMap = new Map<
    number,
    { contractNumber: string | null; itemNumber: string | null; deviatedPrice: number | null; quantity: number | null }
  >();
  if (claimRowIds.length > 0) {
    const claimRows = await prisma.claimRow.findMany({
      where: { id: { in: claimRowIds } },
      select: { id: true, contractNumber: true, itemNumber: true, deviatedPrice: true, quantity: true },
    });
    for (const row of claimRows) {
      claimRowMap.set(row.id, {
        contractNumber: row.contractNumber,
        itemNumber: row.itemNumber,
        deviatedPrice: row.deviatedPrice ? Number(row.deviatedPrice) : null,
        quantity: row.quantity ? Number(row.quantity) : null,
      });
    }
  }

  // Simple, focused columns
  const headers = [
    "Item",
    "Contract",
    "Issue",
    "Description",
    "Claimed Price",
    "Qty",
    "Resolution",
    "Notes",
    "Resolved By",
  ];

  const lines: string[] = [headers.join(",")];

  for (const issue of issues) {
    const cr = issue.claimRowId ? claimRowMap.get(issue.claimRowId) : null;

    const row = [
      cr?.itemNumber ?? "",
      cr?.contractNumber ?? "",
      issue.code,
      csvEscape(issue.description),
      cr?.deviatedPrice != null ? cr.deviatedPrice.toFixed(2) : "",
      cr?.quantity != null ? String(cr.quantity) : "",
      issue.resolution ? issue.resolution.charAt(0).toUpperCase() + issue.resolution.slice(1) : "Pending",
      csvEscape(issue.resolutionNote ?? ""),
      issue.resolvedBy?.displayName ?? "",
    ];
    lines.push(row.join(","));
  }

  const csv = lines.join("\n");
  const period = fmtMonth(run.claimPeriodStart);
  const filename = `Exceptions - ${run.distributor.name} ${period}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function fmtMonth(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
