// GET /api/export/claim-response/:id — Professional "Claim Response" Excel export.
//
// Produces a formatted workbook a sales user can send to the distributor showing:
// - Every claim line with verification status
// - Price discrepancies highlighted with contract vs claimed values
// - Rejected/dismissed lines with reasons
// - Summary sheet with run metadata and resolution counts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import * as ExcelJS from "exceljs";

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
  const { user } = sessionResult;

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

  // Fetch all claim rows for this run's batch
  const claimRows = run.claimBatchId
    ? await prisma.claimRow.findMany({
        where: { batchId: run.claimBatchId },
        orderBy: { rowNumber: "asc" },
      })
    : [];

  // Fetch all issues for this run, keyed by claim row
  const issues = await prisma.reconciliationIssue.findMany({
    where: { reconciliationRunId: runId },
    include: { resolvedBy: { select: { displayName: true } } },
    orderBy: [{ claimRowId: "asc" }, { code: "asc" }],
  });

  // Build issue lookup: claimRowId → issues[]
  const issuesByRow = new Map<number, typeof issues>();
  for (const issue of issues) {
    if (issue.claimRowId) {
      const existing = issuesByRow.get(issue.claimRowId) || [];
      existing.push(issue);
      issuesByRow.set(issue.claimRowId, existing);
    }
  }

  // Fetch matched rebate records for contract price reference
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
  workbook.creator = user.name;
  workbook.created = new Date();

  const periodStart = fmtDate(run.claimPeriodStart);
  const periodEnd = fmtDate(run.claimPeriodEnd);
  const periodLabel = fmtMonth(run.claimPeriodStart);

  // ── Styles ──────────────────────────────────────────────────────────

  const BRENNAN_BLUE = "FF006293";
  const DARK_BLUE = "FF003D5C";

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

  const currencyFmt = '#,##0.0000;[Red]-#,##0.0000';
  const qtyFmt = '#,##0';

  // ── Sheet 1: Claim Review ──────────────────────────────────────────

  const sheet = workbook.addWorksheet("Claim Review");

  // Title area
  sheet.mergeCells("A1:L1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `Claim Review — ${run.distributor.name} (${run.distributor.code})`;
  titleCell.font = { bold: true, size: 14, color: { argb: DARK_BLUE } };
  titleCell.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 28;

  sheet.mergeCells("A2:L2");
  const subtitleCell = sheet.getCell("A2");
  subtitleCell.value = `Claim Period: ${periodLabel}  |  File: ${run.claimBatch?.fileName ?? "N/A"}  |  Reviewed: ${fmtDateTime(new Date())}`;
  subtitleCell.font = { size: 10, color: { argb: "FF666666" } };
  sheet.getRow(2).height = 20;

  // Spacer row
  sheet.getRow(3).height = 8;

  // Column definitions
  const columns = [
    { header: "Row", key: "row", width: 6 },
    { header: "Status", key: "status", width: 14 },
    { header: "Item Number", key: "itemNumber", width: 18 },
    { header: "Contract #", key: "contractNumber", width: 14 },
    { header: "Transaction Date", key: "transactionDate", width: 16 },
    { header: "Quantity", key: "quantity", width: 10 },
    { header: "Claimed Price", key: "claimedPrice", width: 14 },
    { header: "Contract Price", key: "contractPrice", width: 14 },
    { header: "Variance", key: "variance", width: 12 },
    { header: "Claimed Amount", key: "claimedAmount", width: 15 },
    { header: "Exception", key: "exception", width: 22 },
    { header: "Notes", key: "notes", width: 40 },
  ];

  // Set columns (widths)
  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width }));

  // Header row at row 4
  const headerRow = sheet.getRow(4);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.alignment = { horizontal: "left", vertical: "middle" };
    cell.border = thinBorder;
  });
  headerRow.height = 22;

  // Data rows
  let matchedCount = 0;
  let adjustedCount = 0;
  let rejectedCount = 0;
  let dismissedCount = 0;
  let deferredCount = 0;
  let totalClaimedAmount = 0;
  let totalApprovedAmount = 0;

  for (const cr of claimRows) {
    const rowIssues = issuesByRow.get(cr.id) || [];
    const claimedPrice = cr.deviatedPrice ? Number(cr.deviatedPrice) : null;
    const qty = cr.quantity ? Number(cr.quantity) : null;
    const claimed = cr.claimedAmount ? Number(cr.claimedAmount) : (claimedPrice && qty ? claimedPrice * qty : null);

    if (claimed) totalClaimedAmount += claimed;

    // Determine contract price from matched record
    const contractPrice = cr.matchedRecordId ? recordPriceMap.get(cr.matchedRecordId) ?? null : null;

    // Determine line status based on issues
    let lineStatus: string;
    let rowFill: ExcelJS.Fill | undefined;
    let exceptionText = "";
    let notesText = "";

    if (rowIssues.length === 0) {
      // No issues = clean match
      lineStatus = "Verified";
      rowFill = greenFill;
      matchedCount++;
      if (claimed) totalApprovedAmount += claimed;
    } else {
      // Aggregate issue info
      const codes = rowIssues.map((i) => i.code);
      const resolutions = rowIssues.map((i) => i.resolution).filter(Boolean);
      const descriptions = rowIssues.map((i) => i.description);
      const resNotes = rowIssues.map((i) => i.resolutionNote).filter(Boolean);

      exceptionText = codes.join(", ");

      // Build notes from descriptions and resolution notes
      const notesParts: string[] = [];
      for (const issue of rowIssues) {
        notesParts.push(issue.description);
        if (issue.resolutionNote) {
          notesParts.push(`  Resolution: ${issue.resolutionNote}`);
        }
      }
      notesText = notesParts.join("\n");

      if (resolutions.includes("rejected")) {
        lineStatus = "Rejected";
        rowFill = redFill;
        rejectedCount++;
      } else if (resolutions.includes("dismissed")) {
        lineStatus = "Dismissed";
        rowFill = grayFill;
        dismissedCount++;
      } else if (resolutions.includes("deferred")) {
        lineStatus = "Deferred";
        rowFill = yellowFill;
        deferredCount++;
      } else if (resolutions.includes("approved")) {
        // Approved exception = adjustment was made
        lineStatus = "Adjusted";
        rowFill = yellowFill;
        adjustedCount++;
        // For approved price mismatches, use the new price for approved amount
        const priceMismatch = rowIssues.find((i) => i.code === "CLM-001" && i.resolution === "approved");
        if (priceMismatch) {
          const sd = priceMismatch.suggestedData as Record<string, unknown> | null;
          const newPrice = sd?.newPrice ? Number(sd.newPrice) : null;
          if (newPrice && qty) {
            totalApprovedAmount += newPrice * qty;
          } else if (claimed) {
            totalApprovedAmount += claimed;
          }
        } else if (claimed) {
          totalApprovedAmount += claimed;
        }
      } else {
        // Pending review
        lineStatus = "Pending Review";
        rowFill = yellowFill;
      }
    }

    // Calculate variance
    const variance = claimedPrice != null && contractPrice != null
      ? Math.round((claimedPrice - contractPrice) * 10000) / 10000
      : null;

    const dataRow = sheet.addRow({
      row: cr.rowNumber,
      status: lineStatus,
      itemNumber: cr.itemNumber ?? "",
      contractNumber: cr.contractNumber ?? "",
      transactionDate: cr.transactionDate ? fmtDate(cr.transactionDate) : "",
      quantity: qty,
      claimedPrice: claimedPrice,
      contractPrice: contractPrice,
      variance: variance,
      claimedAmount: claimed,
      exception: exceptionText,
      notes: notesText,
    });

    // Apply row styling
    dataRow.eachCell((cell, colNumber) => {
      cell.border = thinBorder;
      cell.alignment = { vertical: "top", wrapText: colNumber === 12 };
      if (rowFill) cell.fill = rowFill;

      // Number formatting
      if ([7, 8, 10].includes(colNumber) && typeof cell.value === "number") {
        cell.numFmt = currencyFmt;
      }
      if (colNumber === 6 && typeof cell.value === "number") {
        cell.numFmt = qtyFmt;
      }
      if (colNumber === 9 && typeof cell.value === "number") {
        cell.numFmt = currencyFmt;
        // Bold red if variance is non-zero
        if (cell.value !== 0 && cell.value !== null) {
          cell.font = { bold: true, color: { argb: "FFD32F2F" } };
        }
      }

      // Status column styling
      if (colNumber === 2) {
        cell.font = { bold: true, size: 10 };
        if (lineStatus === "Verified") cell.font.color = { argb: "FF2E7D32" };
        else if (lineStatus === "Adjusted") cell.font.color = { argb: "FFF57F17" };
        else if (lineStatus === "Rejected") cell.font.color = { argb: "FFC62828" };
        else if (lineStatus === "Dismissed") cell.font.color = { argb: "FF757575" };
        else if (lineStatus === "Deferred") cell.font.color = { argb: "FFE65100" };
        else cell.font.color = { argb: "FFE65100" };
      }
    });
  }

  // Auto-filter on the header row
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + claimRows.length, column: columns.length } };

  // Freeze header row
  sheet.views = [{ state: "frozen", ySplit: 4 }];

  // ── Sheet 2: Summary ───────────────────────────────────────────────

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { key: "label", width: 30 },
    { key: "value", width: 40 },
  ];

  // Title
  summarySheet.mergeCells("A1:B1");
  const sTitleCell = summarySheet.getCell("A1");
  sTitleCell.value = "Reconciliation Summary";
  sTitleCell.font = { bold: true, size: 14, color: { argb: DARK_BLUE } };
  summarySheet.getRow(1).height = 28;

  summarySheet.getRow(2).height = 8; // spacer

  function addSummarySection(title: string, rows: [string, string][]) {
    const titleRow = summarySheet.addRow({ label: title, value: "" });
    titleRow.getCell(1).font = { bold: true, size: 11, color: { argb: BRENNAN_BLUE } };
    titleRow.getCell(1).border = { bottom: { style: "thin", color: { argb: BRENNAN_BLUE } } };
    titleRow.getCell(2).border = { bottom: { style: "thin", color: { argb: BRENNAN_BLUE } } };

    for (const [label, value] of rows) {
      const r = summarySheet.addRow({ label, value });
      r.getCell(1).font = { color: { argb: "FF666666" }, size: 10 };
      r.getCell(2).font = { size: 10 };
    }
    summarySheet.addRow({ label: "", value: "" }); // spacer
  }

  addSummarySection("Run Information", [
    ["Distributor", `${run.distributor.name} (${run.distributor.code})`],
    ["Claim Period", `${periodStart} — ${periodEnd}`],
    ["Claim File", run.claimBatch?.fileName ?? "N/A"],
    ["Run Status", run.status.charAt(0).toUpperCase() + run.status.slice(1)],
    ["Validated By", run.runBy.displayName],
    ["Report Generated", fmtDateTime(new Date())],
    ["Generated By", user.name],
  ]);

  addSummarySection("Claim Line Counts", [
    ["Total Claim Lines", String(claimRows.length)],
    ["Verified (Matched)", String(matchedCount)],
    ["Adjusted (Approved w/ Changes)", String(adjustedCount)],
    ["Rejected", String(rejectedCount)],
    ["Dismissed", String(dismissedCount)],
    ["Deferred", String(deferredCount)],
    ["Exceptions Found", String(issues.length)],
  ]);

  addSummarySection("Financial Summary", [
    ["Total Claimed Amount", `$${totalClaimedAmount.toFixed(2)}`],
    ["Total Approved Amount", `$${totalApprovedAmount.toFixed(2)}`],
    ["Variance", `$${(totalClaimedAmount - totalApprovedAmount).toFixed(2)}`],
  ]);

  const cs = run.commitSummary as CommitSummary | null;
  if (cs) {
    addSummarySection("Commit Outcomes", [
      ["Records Created", String(cs.recordsCreated)],
      ["Records Superseded (Price Updated)", String(cs.recordsSuperseded)],
      ["Records Updated", String(cs.recordsUpdated)],
      ["Items Created", String(cs.itemsCreated)],
      ["Confirmed (Informational)", String(cs.confirmed)],
    ]);
  }

  // ── Sheet 3: Exception Detail ──────────────────────────────────────

  if (issues.length > 0) {
    const exSheet = workbook.addWorksheet("Exception Detail");

    exSheet.mergeCells("A1:J1");
    const exTitle = exSheet.getCell("A1");
    exTitle.value = "Exception Detail";
    exTitle.font = { bold: true, size: 14, color: { argb: DARK_BLUE } };
    exSheet.getRow(1).height = 28;
    exSheet.getRow(2).height = 8;

    const exCols = [
      { header: "Row #", key: "row", width: 7 },
      { header: "Code", key: "code", width: 10 },
      { header: "Severity", key: "severity", width: 10 },
      { header: "Category", key: "category", width: 22 },
      { header: "Item Number", key: "itemNumber", width: 18 },
      { header: "Description", key: "description", width: 50 },
      { header: "Resolution", key: "resolution", width: 14 },
      { header: "Resolution Note", key: "resolutionNote", width: 35 },
      { header: "Resolved By", key: "resolvedBy", width: 16 },
      { header: "Resolved At", key: "resolvedAt", width: 18 },
    ];

    exSheet.columns = exCols.map((c) => ({ key: c.key, width: c.width }));

    const exHeaderRow = exSheet.getRow(3);
    exCols.forEach((col, i) => {
      const cell = exHeaderRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = headerFont;
      cell.fill = headerFill;
      cell.alignment = { horizontal: "left", vertical: "middle" };
      cell.border = thinBorder;
    });
    exHeaderRow.height = 22;

    // Build claim row lookup for row numbers / item numbers
    const claimRowMap = new Map(claimRows.map((r) => [r.id, r]));

    for (const issue of issues) {
      const cr = issue.claimRowId ? claimRowMap.get(issue.claimRowId) : null;

      const exRow = exSheet.addRow({
        row: cr?.rowNumber ?? "",
        code: issue.code,
        severity: issue.severity,
        category: issue.category,
        itemNumber: cr?.itemNumber ?? "",
        description: issue.description,
        resolution: issue.resolution ? issue.resolution.charAt(0).toUpperCase() + issue.resolution.slice(1) : "Pending",
        resolutionNote: issue.resolutionNote ?? "",
        resolvedBy: issue.resolvedBy?.displayName ?? "",
        resolvedAt: issue.resolvedAt ? fmtDateTime(issue.resolvedAt) : "",
      });

      exRow.eachCell((cell, colNumber) => {
        cell.border = thinBorder;
        cell.alignment = { vertical: "top", wrapText: [6, 8].includes(colNumber) };

        // Color severity
        if (colNumber === 3) {
          if (issue.severity === "error") cell.font = { bold: true, color: { argb: "FFC62828" } };
          else if (issue.severity === "warning") cell.font = { bold: true, color: { argb: "FFF57F17" } };
          else cell.font = { color: { argb: "FF1565C0" } };
        }

        // Color resolution
        if (colNumber === 7) {
          const res = issue.resolution;
          if (res === "approved") cell.font = { bold: true, color: { argb: "FF2E7D32" } };
          else if (res === "rejected") cell.font = { bold: true, color: { argb: "FFC62828" } };
          else if (res === "dismissed") cell.font = { color: { argb: "FF757575" } };
          else cell.font = { color: { argb: "FFE65100" } };
        }
      });
    }

    exSheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + issues.length, column: exCols.length } };
    exSheet.views = [{ state: "frozen", ySplit: 3 }];
  }

  // ── Legend note on Claim Review sheet ───────────────────────────────

  const legendRow = sheet.addRow({});
  legendRow.height = 8; // spacer
  const legendStart = sheet.addRow({});
  legendStart.getCell(1).value = "Legend:";
  legendStart.getCell(1).font = { bold: true, size: 9, color: { argb: "FF666666" } };
  const legends = [
    ["Verified", "Claim line matches contract terms — no issues found", greenFill],
    ["Adjusted", "Exception approved — master data updated to reflect claim", yellowFill],
    ["Rejected", "Exception rejected — claim line does not match and was denied", redFill],
    ["Dismissed", "Exception dismissed — informational only, no action needed", grayFill],
  ] as const;
  for (const [status, desc, fill] of legends) {
    const lr = sheet.addRow({});
    lr.getCell(1).value = `  ${status}`;
    lr.getCell(1).font = { bold: true, size: 9 };
    lr.getCell(1).fill = fill;
    lr.getCell(2).value = desc;
    lr.getCell(2).font = { size: 9, color: { argb: "FF666666" } };
  }

  // ── Write and return ───────────────────────────────────────────────

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `claim-response-${run.distributor.code}-${periodLabel.replace(/\s/g, "-")}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// ── Helpers ────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

function fmtMonth(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function fmtDateTime(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}
