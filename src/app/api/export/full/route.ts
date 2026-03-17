import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import * as ExcelJS from "exceljs";

export const dynamic = "force-dynamic";

/**
 * GET /api/export/full
 *
 * Exports all business data as a multi-sheet Excel workbook (.xlsx).
 * Sheets: Distributors, End Users, Contracts, Rebate Plans, Items, Rebate Records, Summary.
 * Requires authentication (any logged-in user).
 */
export async function GET() {
  const result = await getSessionUser();
  if ("error" in result) return result.error;
  const { user } = result;

  // Fetch all data in parallel
  const [distributors, endUsers, contracts, rebatePlans, items, rebateRecords] =
    await Promise.all([
      prisma.distributor.findMany({
        orderBy: { code: "asc" },
      }),
      prisma.endUser.findMany({
        orderBy: { code: "asc" },
      }),
      prisma.contract.findMany({
        include: {
          distributor: { select: { code: true } },
          endUser: { select: { name: true } },
        },
        orderBy: { contractNumber: "asc" },
      }),
      prisma.rebatePlan.findMany({
        include: {
          contract: { select: { contractNumber: true } },
        },
        orderBy: [{ contractId: "asc" }, { planCode: "asc" }],
      }),
      prisma.item.findMany({
        orderBy: { itemNumber: "asc" },
      }),
      prisma.rebateRecord.findMany({
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
      }),
    ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = user.name;
  workbook.created = new Date();

  const headerStyle: Partial<ExcelJS.Style> = {
    font: { bold: true, color: { argb: "FFFFFFFF" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF006293" } },
    alignment: { horizontal: "left" },
  };

  // --- Distributors sheet ---
  const distSheet = workbook.addWorksheet("Distributors");
  distSheet.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Code", key: "code", width: 15 },
    { header: "Name", key: "name", width: 30 },
    { header: "Active", key: "isActive", width: 10 },
    { header: "Created At", key: "createdAt", width: 20 },
  ];
  distSheet.getRow(1).eachCell((cell) => { cell.style = headerStyle; });
  for (const d of distributors) {
    distSheet.addRow({
      id: d.id,
      code: d.code,
      name: d.name,
      isActive: d.isActive ? "Yes" : "No",
      createdAt: d.createdAt.toISOString(),
    });
  }

  // --- End Users sheet ---
  const euSheet = workbook.addWorksheet("End Users");
  euSheet.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Code", key: "code", width: 15 },
    { header: "Name", key: "name", width: 30 },
    { header: "Active", key: "isActive", width: 10 },
    { header: "Created At", key: "createdAt", width: 20 },
  ];
  euSheet.getRow(1).eachCell((cell) => { cell.style = headerStyle; });
  for (const eu of endUsers) {
    euSheet.addRow({
      id: eu.id,
      code: eu.code,
      name: eu.name,
      isActive: eu.isActive ? "Yes" : "No",
      createdAt: eu.createdAt.toISOString(),
    });
  }

  // --- Contracts sheet ---
  const contractSheet = workbook.addWorksheet("Contracts");
  contractSheet.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Contract Number", key: "contractNumber", width: 18 },
    { header: "Distributor Code", key: "distributorCode", width: 18 },
    { header: "End User Name", key: "endUserName", width: 25 },
    { header: "Status", key: "status", width: 12 },
    { header: "Start Date", key: "startDate", width: 14 },
    { header: "End Date", key: "endDate", width: 14 },
  ];
  contractSheet.getRow(1).eachCell((cell) => { cell.style = headerStyle; });
  for (const c of contracts) {
    contractSheet.addRow({
      id: c.id,
      contractNumber: c.contractNumber,
      distributorCode: c.distributor.code,
      endUserName: c.endUser.name,
      status: c.status,
      startDate: c.startDate ? c.startDate.toISOString().split("T")[0] : "",
      endDate: c.endDate ? c.endDate.toISOString().split("T")[0] : "",
    });
  }

  // --- Rebate Plans sheet ---
  const planSheet = workbook.addWorksheet("Rebate Plans");
  planSheet.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Plan Code", key: "planCode", width: 15 },
    { header: "Plan Name", key: "planName", width: 25 },
    { header: "Contract Number", key: "contractNumber", width: 18 },
    { header: "Discount Type", key: "discountType", width: 15 },
    { header: "Status", key: "status", width: 12 },
  ];
  planSheet.getRow(1).eachCell((cell) => { cell.style = headerStyle; });
  for (const p of rebatePlans) {
    planSheet.addRow({
      id: p.id,
      planCode: p.planCode,
      planName: p.planName ?? "",
      contractNumber: p.contract.contractNumber,
      discountType: p.discountType,
      status: p.status,
    });
  }

  // --- Items sheet ---
  const itemSheet = workbook.addWorksheet("Items");
  itemSheet.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Item Number", key: "itemNumber", width: 20 },
    { header: "Description", key: "description", width: 40 },
    { header: "Product Code", key: "productCode", width: 15 },
    { header: "Active", key: "isActive", width: 10 },
  ];
  itemSheet.getRow(1).eachCell((cell) => { cell.style = headerStyle; });
  for (const i of items) {
    itemSheet.addRow({
      id: i.id,
      itemNumber: i.itemNumber,
      description: i.description ?? "",
      productCode: i.productCode ?? "",
      isActive: i.isActive ? "Yes" : "No",
    });
  }

  // --- Rebate Records sheet (denormalized) ---
  const recSheet = workbook.addWorksheet("Rebate Records");
  recSheet.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Plan Code", key: "planCode", width: 15 },
    { header: "Contract Number", key: "contractNumber", width: 18 },
    { header: "Distributor Code", key: "distributorCode", width: 18 },
    { header: "Item Number", key: "itemNumber", width: 20 },
    { header: "Rebate Price", key: "rebatePrice", width: 14 },
    { header: "Start Date", key: "startDate", width: 14 },
    { header: "End Date", key: "endDate", width: 14 },
    { header: "Status", key: "status", width: 12 },
    { header: "Created At", key: "createdAt", width: 20 },
    { header: "Updated At", key: "updatedAt", width: 20 },
  ];
  recSheet.getRow(1).eachCell((cell) => { cell.style = headerStyle; });
  for (const r of rebateRecords) {
    recSheet.addRow({
      id: r.id,
      planCode: r.rebatePlan.planCode,
      contractNumber: r.rebatePlan.contract.contractNumber,
      distributorCode: r.rebatePlan.contract.distributor.code,
      itemNumber: r.item.itemNumber,
      rebatePrice: Number(r.rebatePrice),
      startDate: r.startDate.toISOString().split("T")[0],
      endDate: r.endDate ? r.endDate.toISOString().split("T")[0] : "",
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    });
  }

  // --- Summary sheet ---
  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Metric", key: "metric", width: 25 },
    { header: "Value", key: "value", width: 30 },
  ];
  summarySheet.getRow(1).eachCell((cell) => { cell.style = headerStyle; });
  const exportTimestamp = new Date().toISOString();
  const summaryRows = [
    { metric: "Distributors", value: String(distributors.length) },
    { metric: "End Users", value: String(endUsers.length) },
    { metric: "Contracts", value: String(contracts.length) },
    { metric: "Rebate Plans", value: String(rebatePlans.length) },
    { metric: "Items", value: String(items.length) },
    { metric: "Rebate Records", value: String(rebateRecords.length) },
    { metric: "", value: "" },
    { metric: "Export Timestamp", value: exportTimestamp },
    { metric: "Exported By", value: user.name },
  ];
  for (const row of summaryRows) {
    summarySheet.addRow(row);
  }

  // Write workbook to buffer
  const buffer = await workbook.xlsx.writeBuffer();

  // Build filename with date
  const dateStr = exportTimestamp.split("T")[0];
  const filename = `rms-full-export-${dateStr}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
