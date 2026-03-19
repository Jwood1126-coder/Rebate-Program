// GET /api/export/claim-response/:id — Clean reconciliation report Excel export.
//
// Two sheets:
// 1. "Claim Review" — every claim line with status, prices, and variance
// 2. "Exceptions" — only the exception rows with clear descriptions and resolutions

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import * as ExcelJS from "exceljs";

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
      claimBatch: true,
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

  // Fetch claim rows and issues
  const claimRows = run.claimBatchId
    ? await prisma.claimRow.findMany({
        where: { batchId: run.claimBatchId },
        orderBy: { rowNumber: "asc" },
      })
    : [];

  const issues = await prisma.reconciliationIssue.findMany({
    where: { reconciliationRunId: runId },
    include: { resolvedBy: { select: { displayName: true } } },
    orderBy: [{ claimRowId: "asc" }, { code: "asc" }],
  });

  // Lookups
  const issuesByRow = new Map<number, typeof issues>();
  for (const issue of issues) {
    if (issue.claimRowId) {
      const existing = issuesByRow.get(issue.claimRowId) || [];
      existing.push(issue);
      issuesByRow.set(issue.claimRowId, existing);
    }
  }

  const matchedRecordIds = [
    ...new Set(claimRows.map((r) => r.matchedRecordId).filter((id): id is number => id !== null)),
  ];
  const matchedRecords = matchedRecordIds.length > 0
    ? await prisma.rebateRecord.findMany({
        where: { id: { in: matchedRecordIds } },
        select: { id: true, rebatePrice: true },
      })
    : [];
  const recordPriceMap = new Map(matchedRecords.map((r) => [r.id, Number(r.rebatePrice)]));

  // ── Build workbook ──────────────────────────────────────────────────

  const workbook = new ExcelJS.Workbook();
  const periodLabel = fmtMonth(run.claimPeriodStart);

  // Styles
  const BRENNAN_BLUE = "FF006293";
  const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRENNAN_BLUE } };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  const greenFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
  const yellowFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8E1" } };
  const redFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4EC" } };
  const grayFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFE0E0E0" } },
    bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
    left: { style: "thin", color: { argb: "FFE0E0E0" } },
    right: { style: "thin", color: { argb: "FFE0E0E0" } },
  };

  // ── Sheet 1: Claim Review ──────────────────────────────────────────

  const sheet = workbook.addWorksheet("Claim Review");

  // Title
  sheet.mergeCells("A1:I1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `${run.distributor.name} — Claim Review (${periodLabel})`;
  titleCell.font = { bold: true, size: 13, color: { argb: BRENNAN_BLUE } };
  sheet.getRow(1).height = 28;

  // Subtitle
  sheet.mergeCells("A2:I2");
  sheet.getCell("A2").value = `File: ${run.claimBatch?.fileName ?? "N/A"}  |  ${fmtDate(new Date())}`;
  sheet.getCell("A2").font = { size: 9, color: { argb: "FF999999" } };

  // Columns — simplified from 12 to 9
  const columns = [
    { header: "Item", key: "item", width: 20 },
    { header: "Contract", key: "contract", width: 12 },
    { header: "Status", key: "status", width: 12 },
    { header: "Qty", key: "qty", width: 8 },
    { header: "Claimed Price", key: "claimedPrice", width: 14 },
    { header: "Contract Price", key: "contractPrice", width: 14 },
    { header: "Variance", key: "variance", width: 12 },
    { header: "Issue", key: "issue", width: 16 },
    { header: "Notes", key: "notes", width: 40 },
  ];

  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width }));

  const headerRow = sheet.getRow(4);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.border = thinBorder;
  });
  headerRow.height = 22;

  // Data rows
  for (const cr of claimRows) {
    const rowIssues = issuesByRow.get(cr.id) || [];
    const claimedPrice = cr.deviatedPrice ? Number(cr.deviatedPrice) : null;
    const qty = cr.quantity ? Number(cr.quantity) : null;
    const contractPrice = cr.matchedRecordId ? recordPriceMap.get(cr.matchedRecordId) ?? null : null;
    const variance = claimedPrice != null && contractPrice != null
      ? Math.round((claimedPrice - contractPrice) * 10000) / 10000
      : null;

    // Determine status
    let lineStatus: string;
    let rowFill: ExcelJS.Fill | undefined;
    let issueText = "";
    let notesText = "";

    if (rowIssues.length === 0) {
      lineStatus = "OK";
      rowFill = greenFill;
    } else {
      issueText = rowIssues.map((i) => i.code).join(", ");
      notesText = rowIssues.map((i) => i.description).join("; ");

      const resolutions = rowIssues.map((i) => i.resolution).filter(Boolean);
      if (resolutions.includes("rejected")) {
        lineStatus = "Rejected";
        rowFill = redFill;
      } else if (resolutions.includes("dismissed")) {
        lineStatus = "Dismissed";
        rowFill = grayFill;
      } else if (resolutions.includes("approved")) {
        lineStatus = "Adjusted";
        rowFill = yellowFill;
      } else {
        lineStatus = "Pending";
        rowFill = yellowFill;
      }
    }

    const dataRow = sheet.addRow({
      item: cr.itemNumber ?? "",
      contract: cr.contractNumber ?? "",
      status: lineStatus,
      qty,
      claimedPrice,
      contractPrice,
      variance,
      issue: issueText,
      notes: notesText,
    });

    dataRow.eachCell((cell, colNumber) => {
      cell.border = thinBorder;
      if (rowFill) cell.fill = rowFill;

      // Currency formatting
      if ([5, 6].includes(colNumber) && typeof cell.value === "number") {
        cell.numFmt = "#,##0.0000";
      }
      if (colNumber === 7 && typeof cell.value === "number") {
        cell.numFmt = "#,##0.0000";
        if (cell.value !== 0) cell.font = { bold: true, color: { argb: "FFD32F2F" } };
      }

      // Status colors
      if (colNumber === 3) {
        cell.font = { bold: true, size: 10 };
        if (lineStatus === "OK") cell.font.color = { argb: "FF2E7D32" };
        else if (lineStatus === "Adjusted") cell.font.color = { argb: "FFF57F17" };
        else if (lineStatus === "Rejected") cell.font.color = { argb: "FFC62828" };
        else if (lineStatus === "Dismissed") cell.font.color = { argb: "FF757575" };
        else cell.font.color = { argb: "FFE65100" };
      }
    });
  }

  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + claimRows.length, column: columns.length } };
  sheet.views = [{ state: "frozen", ySplit: 4 }];

  // ── Sheet 2: Exceptions Only ───────────────────────────────────────

  if (issues.length > 0) {
    const exSheet = workbook.addWorksheet("Exceptions");

    exSheet.mergeCells("A1:F1");
    exSheet.getCell("A1").value = `Exceptions — ${run.distributor.name} (${periodLabel})`;
    exSheet.getCell("A1").font = { bold: true, size: 13, color: { argb: BRENNAN_BLUE } };
    exSheet.getRow(1).height = 28;

    // Simplified columns — 6 instead of 10
    const exCols = [
      { header: "Item", key: "item", width: 20 },
      { header: "Contract", key: "contract", width: 12 },
      { header: "Issue", key: "issue", width: 12 },
      { header: "Description", key: "description", width: 45 },
      { header: "Resolution", key: "resolution", width: 14 },
      { header: "Notes", key: "notes", width: 35 },
    ];

    exSheet.columns = exCols.map((c) => ({ key: c.key, width: c.width }));

    const exHeaderRow = exSheet.getRow(3);
    exCols.forEach((col, i) => {
      const cell = exHeaderRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = headerFont;
      cell.fill = headerFill;
      cell.border = thinBorder;
    });
    exHeaderRow.height = 22;

    const claimRowMap = new Map(claimRows.map((r) => [r.id, r]));

    for (const issue of issues) {
      const cr = issue.claimRowId ? claimRowMap.get(issue.claimRowId) : null;
      const resLabel = issue.resolution
        ? issue.resolution.charAt(0).toUpperCase() + issue.resolution.slice(1)
        : "Pending";

      const exRow = exSheet.addRow({
        item: cr?.itemNumber ?? "",
        contract: cr?.contractNumber ?? "",
        issue: issue.code,
        description: issue.description,
        resolution: resLabel,
        notes: issue.resolutionNote ?? "",
      });

      // Row coloring by resolution
      let rowFill: ExcelJS.Fill | undefined;
      if (issue.resolution === "approved") rowFill = yellowFill;
      else if (issue.resolution === "rejected") rowFill = redFill;
      else if (issue.resolution === "dismissed") rowFill = grayFill;

      exRow.eachCell((cell, colNumber) => {
        cell.border = thinBorder;
        cell.alignment = { vertical: "top", wrapText: [4, 6].includes(colNumber) };
        if (rowFill) cell.fill = rowFill;

        if (colNumber === 5) {
          cell.font = { bold: true, size: 10 };
          if (issue.resolution === "approved") cell.font.color = { argb: "FF2E7D32" };
          else if (issue.resolution === "rejected") cell.font.color = { argb: "FFC62828" };
          else if (issue.resolution === "dismissed") cell.font.color = { argb: "FF757575" };
          else cell.font.color = { argb: "FFE65100" };
        }
      });
    }

    exSheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + issues.length, column: exCols.length } };
    exSheet.views = [{ state: "frozen", ySplit: 3 }];
  }

  // ── Write and return ───────────────────────────────────────────────

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `Claim Review - ${run.distributor.name} ${periodLabel}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function fmtMonth(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
