// GET /api/export/reconciliation-run/:id — CSV export of a reconciliation run.
//
// Produces a report suitable for internal review, manager meetings, and
// distributor follow-up. Format:
//   - Metadata header rows (prefixed with #)
//   - Summary counts
//   - Issue table with resolutions, identifiers, and record links

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

interface CommitSummary {
  totalApproved: number;
  recordsCreated: number;
  recordsSuperseded: number;
  recordsUpdated: number;
  itemsCreated: number;
  confirmed: number;
  rejected: number;
  dismissed: number;
  deferred: number;
}

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
      claimBatch: true,
      runBy: { select: { displayName: true } },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Only allow export for runs that have been reviewed or committed
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

  // Fetch claim rows for context (contract/item identifiers, pricing)
  const claimRowIds = [...new Set(issues.map(i => i.claimRowId).filter((id): id is number => id !== null))];
  const claimRowMap = new Map<number, { contractNumber: string | null; planCode: string | null; itemNumber: string | null; deviatedPrice: number | null; claimedAmount: number | null; quantity: number | null }>();
  if (claimRowIds.length > 0) {
    const claimRows = await prisma.claimRow.findMany({
      where: { id: { in: claimRowIds } },
      select: { id: true, contractNumber: true, planCode: true, itemNumber: true, deviatedPrice: true, claimedAmount: true, quantity: true },
    });
    for (const row of claimRows) {
      claimRowMap.set(row.id, {
        contractNumber: row.contractNumber,
        planCode: row.planCode,
        itemNumber: row.itemNumber,
        deviatedPrice: row.deviatedPrice ? Number(row.deviatedPrice) : null,
        claimedAmount: row.claimedAmount ? Number(row.claimedAmount) : null,
        quantity: row.quantity ? Number(row.quantity) : null,
      });
    }
  }

  // Build CSV
  const lines: string[] = [];

  // --- Metadata header ---
  const periodStart = formatDate(run.claimPeriodStart);
  const periodEnd = formatDate(run.claimPeriodEnd);

  lines.push(`# Reconciliation Run Report`);
  lines.push(`# Run ID: ${run.id}`);
  lines.push(`# Distributor: ${run.distributor.code} (${run.distributor.name})`);
  lines.push(`# Claim Period: ${periodStart} - ${periodEnd}`);
  lines.push(`# Status: ${run.status}`);
  lines.push(`# Run By: ${run.runBy.displayName}`);
  lines.push(`# Started: ${run.startedAt.toISOString()}`);
  if (run.completedAt) {
    lines.push(`# Committed: ${run.completedAt.toISOString()}`);
  }
  if (run.claimBatch) {
    lines.push(`# Claim File: ${run.claimBatch.fileName}`);
  }
  lines.push(`#`);

  // --- Summary counts ---
  lines.push(`# Summary`);
  lines.push(`# Total Claim Lines: ${run.totalClaimLines}`);
  lines.push(`# Validated (Matched): ${run.validatedCount}`);
  lines.push(`# Exceptions: ${run.exceptionCount}`);

  // Resolution breakdown from issues
  const resolutionCounts = { approved: 0, rejected: 0, dismissed: 0, deferred: 0, pending: 0 };
  for (const issue of issues) {
    const res = issue.resolution as string | null;
    if (res && res in resolutionCounts) {
      resolutionCounts[res as keyof typeof resolutionCounts]++;
    } else {
      resolutionCounts.pending++;
    }
  }

  lines.push(`# Approved: ${resolutionCounts.approved}`);
  lines.push(`# Rejected: ${resolutionCounts.rejected}`);
  lines.push(`# Dismissed: ${resolutionCounts.dismissed}`);
  lines.push(`# Deferred: ${resolutionCounts.deferred}`);
  if (resolutionCounts.pending > 0) {
    lines.push(`# Pending: ${resolutionCounts.pending}`);
  }

  // Commit outcomes (if available)
  const cs = run.commitSummary as CommitSummary | null;
  if (cs) {
    lines.push(`#`);
    lines.push(`# Commit Outcomes`);
    lines.push(`# Records Created: ${cs.recordsCreated}`);
    lines.push(`# Records Superseded: ${cs.recordsSuperseded}`);
    lines.push(`# Records Updated: ${cs.recordsUpdated}`);
    lines.push(`# Items Created: ${cs.itemsCreated}`);
    lines.push(`# Confirmed (no change): ${cs.confirmed}`);
  }

  lines.push(`#`);

  // --- Issue table ---
  const headers = [
    "Issue ID",
    "Claim Row",
    "Exception Code",
    "Severity",
    "Category",
    "Description",
    "Suggested Action",
    "Resolution",
    "Resolution Note",
    "Resolved By",
    "Resolved At",
    "Contract #",
    "Plan Code",
    "Item #",
    "Claimed Price",
    "Claimed Amount",
    "Quantity",
    "Master Record ID",
    "Committed Record ID",
  ];

  lines.push(headers.join(","));

  for (const issue of issues) {
    const cr = issue.claimRowId ? claimRowMap.get(issue.claimRowId) : null;
    const row = [
      issue.id,
      issue.claimRowId ?? "",
      issue.code,
      issue.severity,
      issue.category,
      csvEscape(issue.description),
      issue.suggestedAction,
      issue.resolution ?? "pending",
      csvEscape(issue.resolutionNote ?? ""),
      issue.resolvedBy?.displayName ?? "",
      issue.resolvedAt ? new Date(issue.resolvedAt).toISOString() : "",
      cr?.contractNumber ?? "",
      cr?.planCode ?? "",
      cr?.itemNumber ?? "",
      cr?.deviatedPrice != null ? cr.deviatedPrice.toFixed(4) : "",
      cr?.claimedAmount != null ? cr.claimedAmount.toFixed(4) : "",
      cr?.quantity != null ? cr.quantity : "",
      issue.masterRecordId ?? "",
      issue.committedRecordId ?? "",
    ];
    lines.push(row.join(","));
  }

  const csv = lines.join("\n");
  const filename = `reconciliation-run-${run.id}-${run.distributor.code}-${periodStart.replace(/\//g, "-")}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function formatDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
