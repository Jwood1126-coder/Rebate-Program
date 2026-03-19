import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import * as XLSX from "xlsx";

/**
 * GET /api/export/fastenal-spa/:contractId
 *
 * Exports a contract in the Fastenal Special Pricing Agreement (SPA) format.
 * Layout matches the actual Fastenal SPA template (e.g., Bayshore SPA 1 1 2026.xlsx):
 * - Title in D1
 * - Labels in column C, values in column D (rows 3-18)
 * - Line item headers in B22:H22
 * - Line item data starting at row 23 in column B
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> }
) {
  const result = await getSessionUser();
  if ("error" in result) return result.error;

  const { contractId } = await params;
  const id = Number(contractId);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid contract ID" }, { status: 400 });
  }

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      distributor: true,
      endUser: true,
      rebatePlans: {
        include: {
          rebateRecords: {
            where: {
              status: { notIn: ["cancelled", "superseded"] },
              startDate: { lte: new Date() },
              OR: [
                { endDate: null },
                { endDate: { gte: new Date() } },
              ],
              supersededById: null,
            },
            include: { item: true },
            orderBy: { item: { itemNumber: "asc" } },
          },
        },
      },
    },
  });

  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  // Server-side restriction: only Fastenal contracts can use this export format
  if (contract.distributor.code !== "FAS") {
    return NextResponse.json({ error: "Fastenal SPA export is only available for Fastenal contracts" }, { status: 400 });
  }

  // Flatten current operative records across plans (started, not ended, not superseded)
  const records = contract.rebatePlans.flatMap((p) => p.rebateRecords);

  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};

  function setCell(ref: string, value: string | number) {
    ws[ref] = { v: value, t: typeof value === "number" ? "n" : "s" };
  }

  // --- Header Section (matches actual Fastenal SPA layout) ---
  // Title in D1
  setCell("D1", "Special Pricing Agreement");

  // Multi-location note area in F2
  setCell("F2", "If Agreement Type is Multi-Location or National Account, please provide a brief explanation of the scope of the SPA and details End User location information below:");

  // Vendor info — labels in C, values in D
  setCell("C3", "Vendor ID:");
  setCell("D3", "131563");
  setCell("C4", "Vendor Name:");
  setCell("D4", "Brennan Industries");

  // Agreement info
  setCell("C6", "Agreement #:");
  setCell("D6", contract.contractNumber);
  setCell("C7", "Effective Date:");
  // Store as formatted date string
  if (contract.startDate) {
    const d = contract.startDate;
    setCell("D7", `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`);
  }
  setCell("C8", "Currency:");
  setCell("D8", "USD");

  // End user
  setCell("C10", "End User:");
  setCell("D10", contract.endUser?.name ?? "");

  // Address fields (blank — user fills in)
  setCell("C11", "Address:");
  setCell("C12", "State:");
  setCell("C13", "Zip Code:");

  // Agreement type
  setCell("C15", "Single Location:");
  setCell("D15", "");
  setCell("C16", "Multi-Location:");
  setCell("D16", "");
  setCell("C17", "Global Account:");
  setCell("D17", "");
  setCell("C18", "Promotional:");
  setCell("D18", "");

  // Disclaimer
  setCell("C20", 'By submitting this Agreement, the "Supplier" agrees to the terms and conditions of Fastenal\'s targeted price agreement Program');

  // --- Line Items Table (row 22+, starting in column B) ---

  // Headers in row 22
  setCell("B22", "Supplier P/N");
  setCell("C22", "Fastenal P/N");
  setCell("D22", "Item Description");
  setCell("E22", "Deviated UOM");
  setCell("F22", "Standard Price");
  setCell("G22", "Agreement Price");

  // Data rows starting at 23
  records.forEach((r, i) => {
    const row = 23 + i;
    setCell(`B${row}`, r.item.itemNumber);           // Supplier P/N
    setCell(`C${row}`, "");                            // Fastenal P/N (they fill)
    setCell(`D${row}`, r.item.description ?? "");      // Item Description
    setCell(`E${row}`, "Each");                        // Deviated UOM
    setCell(`F${row}`, "");                            // Standard Price (they fill)
    // Agreement Price — full decimal precision like the original
    ws[`G${row}`] = { v: Number(r.rebatePrice), t: "n", z: "0.00########" };
  });

  // Column widths matching the actual SPA layout
  ws["!cols"] = [
    { wch: 3 },   // A: spacer
    { wch: 20 },  // B: Supplier P/N
    { wch: 15 },  // C: Fastenal P/N / labels
    { wch: 30 },  // D: Description / values
    { wch: 14 },  // E: Deviated UOM
    { wch: 15 },  // F: Standard Price
    { wch: 18 },  // G: Agreement Price
    { wch: 40 },  // H: Notes area
  ];

  // Set range
  const lastRow = Math.max(22, 23 + records.length - 1);
  ws["!ref"] = `A1:H${lastRow}`;

  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const endUserSlug = (contract.endUser?.name ?? "contract").replace(/[^a-zA-Z0-9]/g, "-");
  const dateStr = contract.startDate
    ? `${contract.startDate.getMonth() + 1} ${contract.startDate.getDate()} ${contract.startDate.getFullYear()}`
    : new Date().toISOString().split("T")[0];
  const filename = `${endUserSlug} SPA ${dateStr}.xlsx`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
