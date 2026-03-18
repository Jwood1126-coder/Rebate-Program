import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // --- Users ---
  const adminPassword = await bcrypt.hash("admin123", 10);
  const managerPassword = await bcrypt.hash("manager123", 10);
  const viewerPassword = await bcrypt.hash("viewer123", 10);

  const systemUser = await prisma.user.upsert({
    where: { username: "system" },
    update: {},
    create: {
      username: "system",
      displayName: "System",
      email: "system@brennaninc.com",
      passwordHash: await bcrypt.hash("no-login", 10),
      role: "admin",
    },
  });

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      displayName: "Admin User",
      email: "admin@brennaninc.com",
      passwordHash: adminPassword,
      role: "admin",
    },
  });

  const manager = await prisma.user.upsert({
    where: { username: "jwood" },
    update: {},
    create: {
      username: "jwood",
      displayName: "J. Wood",
      email: "jwood@brennaninc.com",
      passwordHash: managerPassword,
      role: "rebate_manager",
    },
  });

  await prisma.user.upsert({
    where: { username: "viewer" },
    update: {},
    create: {
      username: "viewer",
      displayName: "Sales Viewer",
      email: "viewer@brennaninc.com",
      passwordHash: viewerPassword,
      role: "viewer",
    },
  });

  // --- Distributors ---
  const fas = await prisma.distributor.upsert({
    where: { code: "FAS" },
    update: {},
    create: { code: "FAS", name: "Fastenal" },
  });

  const motion = await prisma.distributor.upsert({
    where: { code: "MOTION" },
    update: {},
    create: { code: "MOTION", name: "Motion Industries" },
  });

  const hsc = await prisma.distributor.upsert({
    where: { code: "HSC" },
    update: {},
    create: { code: "HSC", name: "HSC Industrial Supply" },
  });

  const ait = await prisma.distributor.upsert({
    where: { code: "AIT" },
    update: {},
    create: { code: "AIT", name: "AIT Supply" },
  });

  const lgg = await prisma.distributor.upsert({
    where: { code: "LGG" },
    update: {},
    create: { code: "LGG", name: "LGG Industrial" },
  });

  const tipco = await prisma.distributor.upsert({
    where: { code: "TIPCO" },
    update: {},
    create: { code: "TIPCO", name: "TIPCO Technologies" },
  });

  // --- End Users ---
  const linkBelt = await prisma.endUser.upsert({
    where: { code: "LINK-BELT" },
    update: {},
    create: { code: "LINK-BELT", name: "Link-Belt" },
  });

  const cat = await prisma.endUser.upsert({
    where: { code: "CAT" },
    update: {},
    create: { code: "CAT", name: "Caterpillar" },
  });

  const deere = await prisma.endUser.upsert({
    where: { code: "DEERE" },
    update: {},
    create: { code: "DEERE", name: "John Deere" },
  });

  const komatsu = await prisma.endUser.upsert({
    where: { code: "KOMATSU" },
    update: {},
    create: { code: "KOMATSU", name: "Komatsu" },
  });

  // --- Contracts (one per distributor+end_user) ---
  const contract1 = await prisma.contract.upsert({
    where: { distributorId_endUserId_contractNumber: { distributorId: fas.id, endUserId: linkBelt.id, contractNumber: "101700" } },
    update: {},
    create: {
      distributorId: fas.id,
      endUserId: linkBelt.id,
      contractNumber: "101700",
      description: "Fastenal / Link-Belt rebate agreement",
      startDate: new Date("2023-11-01"),
      endDate: new Date("2026-12-31"),
      status: "active",
    },
  });

  const contract2 = await prisma.contract.upsert({
    where: { distributorId_endUserId_contractNumber: { distributorId: fas.id, endUserId: cat.id, contractNumber: "101812" } },
    update: {},
    create: {
      distributorId: fas.id,
      endUserId: cat.id,
      contractNumber: "101812",
      description: "Fastenal / Caterpillar hydraulics",
      startDate: new Date("2024-03-01"),
      endDate: new Date("2027-02-28"),
      status: "active",
    },
  });

  const contract3 = await prisma.contract.upsert({
    where: { distributorId_endUserId_contractNumber: { distributorId: motion.id, endUserId: deere.id, contractNumber: "102100" } },
    update: {},
    create: {
      distributorId: motion.id,
      endUserId: deere.id,
      contractNumber: "102100",
      description: "Motion / John Deere bearing program",
      startDate: new Date("2024-01-01"),
      endDate: new Date("2025-12-31"),
      status: "active",
    },
  });

  // Motion / Komatsu contract (active through 2027)
  const contract4 = await prisma.contract.upsert({
    where: { distributorId_endUserId_contractNumber: { distributorId: motion.id, endUserId: komatsu.id, contractNumber: "102450" } },
    update: {},
    create: {
      distributorId: motion.id,
      endUserId: komatsu.id,
      contractNumber: "102450",
      description: "Motion / Komatsu hydraulics & fittings",
      startDate: new Date("2025-06-01"),
      endDate: new Date("2027-05-31"),
      status: "active",
    },
  });

  // --- Rebate Plans ---
  const planOSW = await prisma.rebatePlan.upsert({
    where: { contractId_planCode: { contractId: contract1.id, planCode: "OSW" } },
    update: {},
    create: { contractId: contract1.id, planCode: "OSW", planName: "OSW Products", discountType: "part", status: "active" },
  });

  const planHYD = await prisma.rebatePlan.upsert({
    where: { contractId_planCode: { contractId: contract2.id, planCode: "HYD" } },
    update: {},
    create: { contractId: contract2.id, planCode: "HYD", planName: "Hydraulic Fittings", discountType: "part", status: "active" },
  });

  const planBRG = await prisma.rebatePlan.upsert({
    where: { contractId_planCode: { contractId: contract3.id, planCode: "BRG" } },
    update: {},
    create: { contractId: contract3.id, planCode: "BRG", planName: "Bearing Program", discountType: "product_code", status: "active" },
  });

  const planMHF = await prisma.rebatePlan.upsert({
    where: { contractId_planCode: { contractId: contract4.id, planCode: "MHF" } },
    update: {},
    create: { contractId: contract4.id, planCode: "MHF", planName: "Motion Hydraulic Fittings", discountType: "part", status: "active" },
  });

  // --- Items ---
  // Original items + items from FAS/OSW spreadsheet data
  const items = await Promise.all([
    prisma.item.upsert({ where: { itemNumber: "0304-C-04" }, update: {}, create: { itemNumber: "0304-C-04", description: "O-Ring Seal 1/4\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "0305-B-08" }, update: {}, create: { itemNumber: "0305-B-08", description: "O-Ring Seal 1/2\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "0308-A-16" }, update: {}, create: { itemNumber: "0308-A-16", description: "O-Ring Seal 1\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "1100-C-12" }, update: {}, create: { itemNumber: "1100-C-12", description: "Hydraulic Fitting 3/4\"", productCode: "HYD" } }),
    prisma.item.upsert({ where: { itemNumber: "1100-D-16" }, update: {}, create: { itemNumber: "1100-D-16", description: "Hydraulic Fitting 1\"", productCode: "HYD" } }),
    prisma.item.upsert({ where: { itemNumber: "2200-A-08" }, update: {}, create: { itemNumber: "2200-A-08", description: "Ball Bearing 1/2\"", productCode: "BRG" } }),
    prisma.item.upsert({ where: { itemNumber: "0505-D-12" }, update: {}, create: { itemNumber: "0505-D-12", description: "Pipe Fitting 3/4\"", productCode: "FIT" } }),
    prisma.item.upsert({ where: { itemNumber: "0204-C-06" }, update: {}, create: { itemNumber: "0204-C-06", description: "Compression Fitting 3/8\"", productCode: "FIT" } }),
    // FAS/OSW spreadsheet items
    prisma.item.upsert({ where: { itemNumber: "0304-C-06" }, update: {}, create: { itemNumber: "0304-C-06", description: "O-Ring Seal 3/8\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "0304-C-08" }, update: {}, create: { itemNumber: "0304-C-08", description: "O-Ring Seal 1/2\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "0304-C-12" }, update: {}, create: { itemNumber: "0304-C-12", description: "O-Ring Seal 3/4\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "1700-16-16" }, update: {}, create: { itemNumber: "1700-16-16", description: "OSW Fitting 1\"x1\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "1700-20-16" }, update: {}, create: { itemNumber: "1700-20-16", description: "OSW Fitting 1-1/4\"x1\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "1704-20-16" }, update: {}, create: { itemNumber: "1704-20-16", description: "OSW Elbow 1-1/4\"x1\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "1901-16" }, update: {}, create: { itemNumber: "1901-16", description: "OSW Cap 1\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2403-12-12" }, update: {}, create: { itemNumber: "2403-12-12", description: "OSW Adapter 3/4\"x3/4\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2403-16-16" }, update: {}, create: { itemNumber: "2403-16-16", description: "OSW Adapter 1\"x1\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2403-20-12" }, update: {}, create: { itemNumber: "2403-20-12", description: "OSW Adapter 1-1/4\"x3/4\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2404-04-02" }, update: {}, create: { itemNumber: "2404-04-02", description: "OSW Elbow Adapter 1/4\"x1/8\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2404-04-06" }, update: {}, create: { itemNumber: "2404-04-06", description: "OSW Elbow Adapter 1/4\"x3/8\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2404-06-04" }, update: {}, create: { itemNumber: "2404-06-04", description: "OSW Elbow Adapter 3/8\"x1/4\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2404-06-06" }, update: {}, create: { itemNumber: "2404-06-06", description: "OSW Elbow Adapter 3/8\"x3/8\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2404-08-06" }, update: {}, create: { itemNumber: "2404-08-06", description: "OSW Elbow Adapter 1/2\"x3/8\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2404-12-08" }, update: {}, create: { itemNumber: "2404-12-08", description: "OSW Elbow Adapter 3/4\"x1/2\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2404-12-12" }, update: {}, create: { itemNumber: "2404-12-12", description: "OSW Elbow Adapter 3/4\"x3/4\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2404-16-12" }, update: {}, create: { itemNumber: "2404-16-12", description: "OSW Elbow Adapter 1\"x3/4\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2406-08-12" }, update: {}, create: { itemNumber: "2406-08-12", description: "OSW Tee 1/2\"x3/4\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2406-10-06" }, update: {}, create: { itemNumber: "2406-10-06", description: "OSW Tee 5/8\"x3/8\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2406-10-12" }, update: {}, create: { itemNumber: "2406-10-12", description: "OSW Tee 5/8\"x3/4\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2406-12-08" }, update: {}, create: { itemNumber: "2406-12-08", description: "OSW Tee 3/4\"x1/2\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2406-16-12" }, update: {}, create: { itemNumber: "2406-16-12", description: "OSW Tee 1\"x3/4\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2406-20-08" }, update: {}, create: { itemNumber: "2406-20-08", description: "OSW Tee 1-1/4\"x1/2\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2406-20-16" }, update: {}, create: { itemNumber: "2406-20-16", description: "OSW Tee 1-1/4\"x1\"", productCode: "OSW" } }),
    prisma.item.upsert({ where: { itemNumber: "2408-10" }, update: {}, create: { itemNumber: "2408-10", description: "OSW Cross 5/8\"", productCode: "OSW" } }),
    // Motion / Komatsu items (idx 34-41)
    prisma.item.upsert({ where: { itemNumber: "6801-08-08-NWO-FG" }, update: {}, create: { itemNumber: "6801-08-08-NWO-FG", description: "1/2\" Male JIC x 1/2\" Male ORB 90 Elbow", productCode: "HYD" } }),
    prisma.item.upsert({ where: { itemNumber: "6801-12-12-NWO-FG" }, update: {}, create: { itemNumber: "6801-12-12-NWO-FG", description: "3/4\" Male JIC x 3/4\" Male ORB 90 Elbow", productCode: "HYD" } }),
    prisma.item.upsert({ where: { itemNumber: "6801-16-16-NWO-FG" }, update: {}, create: { itemNumber: "6801-16-16-NWO-FG", description: "1\" Male JIC x 1\" Male ORB 90 Elbow", productCode: "HYD" } }),
    prisma.item.upsert({ where: { itemNumber: "6400-08-08" }, update: {}, create: { itemNumber: "6400-08-08", description: "1/2\" Male ORB x 1/2\" Male Pipe Adapter", productCode: "HYD" } }),
    prisma.item.upsert({ where: { itemNumber: "6400-12-12" }, update: {}, create: { itemNumber: "6400-12-12", description: "3/4\" Male ORB x 3/4\" Male Pipe Adapter", productCode: "HYD" } }),
    prisma.item.upsert({ where: { itemNumber: "6400-16-16" }, update: {}, create: { itemNumber: "6400-16-16", description: "1\" Male ORB x 1\" Male Pipe Adapter", productCode: "HYD" } }),
    prisma.item.upsert({ where: { itemNumber: "6502-12-12" }, update: {}, create: { itemNumber: "6502-12-12", description: "3/4\" Female JIC Swivel x 3/4\" Male ORB", productCode: "HYD" } }),
    prisma.item.upsert({ where: { itemNumber: "6502-16-16" }, update: {}, create: { itemNumber: "6502-16-16", description: "1\" Female JIC Swivel x 1\" Male ORB", productCode: "HYD" } }),
  ]);

  // --- Rebate Records ---
  // Original records + FAS/OSW spreadsheet data (Contract 101700, Plan OSW, all starting 11/1/2023, ending 12/31/2026)
  const recordData = [
    // Original seed records
    { planId: planOSW.id, itemIdx: 0, price: 0.30, start: "2023-11-01", end: "2026-12-31", status: "active" },
    { planId: planOSW.id, itemIdx: 1, price: 0.45, start: "2023-11-01", end: "2026-12-31", status: "active" },
    { planId: planOSW.id, itemIdx: 2, price: 0.75, start: "2023-01-01", end: "2023-10-31", status: "expired" },
    { planId: planHYD.id, itemIdx: 3, price: 1.20, start: "2024-03-01", end: "2027-02-28", status: "active" },
    { planId: planHYD.id, itemIdx: 4, price: 1.50, start: "2027-01-01", end: "2027-12-31", status: "future" },
    { planId: planBRG.id, itemIdx: 5, price: 0.65, start: "2024-01-01", end: "2025-12-31", status: "active" },
    // FAS/OSW spreadsheet records (rows 2-30 from provided data)
    { planId: planOSW.id, itemIdx: 8, price: 0.37, start: "2023-11-01", end: "2026-12-31", status: "active" },   // 0304-C-06
    { planId: planOSW.id, itemIdx: 9, price: 0.51, start: "2023-11-01", end: "2026-12-31", status: "active" },   // 0304-C-08
    { planId: planOSW.id, itemIdx: 10, price: 0.71, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 0304-C-12
    { planId: planOSW.id, itemIdx: 11, price: 9.30, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 1700-16-16
    { planId: planOSW.id, itemIdx: 12, price: 9.73, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 1700-20-16
    { planId: planOSW.id, itemIdx: 13, price: 20.88, start: "2023-11-01", end: "2026-12-31", status: "active" }, // 1704-20-16
    { planId: planOSW.id, itemIdx: 14, price: 6.16, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 1901-16
    { planId: planOSW.id, itemIdx: 15, price: 1.88, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2403-12-12
    { planId: planOSW.id, itemIdx: 16, price: 2.43, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2403-16-16
    { planId: planOSW.id, itemIdx: 17, price: 6.49, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2403-20-12
    { planId: planOSW.id, itemIdx: 18, price: 0.39, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2404-04-02
    { planId: planOSW.id, itemIdx: 19, price: 0.83, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2404-04-06
    { planId: planOSW.id, itemIdx: 20, price: 0.48, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2404-06-04
    { planId: planOSW.id, itemIdx: 21, price: 0.74, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2404-06-06
    { planId: planOSW.id, itemIdx: 22, price: 0.77, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2404-08-06
    { planId: planOSW.id, itemIdx: 23, price: 1.62, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2404-12-08
    { planId: planOSW.id, itemIdx: 24, price: 1.59, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2404-12-12
    { planId: planOSW.id, itemIdx: 25, price: 2.68, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2404-16-12
    { planId: planOSW.id, itemIdx: 26, price: 2.39, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2406-08-12
    { planId: planOSW.id, itemIdx: 27, price: 1.98, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2406-10-06
    { planId: planOSW.id, itemIdx: 28, price: 2.29, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2406-10-12
    { planId: planOSW.id, itemIdx: 29, price: 2.16, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2406-12-08
    { planId: planOSW.id, itemIdx: 30, price: 3.07, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2406-16-12
    { planId: planOSW.id, itemIdx: 31, price: 7.22, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2406-20-08
    { planId: planOSW.id, itemIdx: 32, price: 5.61, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2406-20-16
    { planId: planOSW.id, itemIdx: 33, price: 0.86, start: "2023-11-01", end: "2026-12-31", status: "active" },  // 2408-10
    // Motion / Komatsu (contract 102450, plan MHF)
    { planId: planMHF.id, itemIdx: 34, price: 3.80, start: "2025-06-01", end: "2027-05-31", status: "active" },  // 6801-08-08-NWO-FG
    { planId: planMHF.id, itemIdx: 35, price: 5.52, start: "2025-06-01", end: "2027-05-31", status: "active" },  // 6801-12-12-NWO-FG
    { planId: planMHF.id, itemIdx: 36, price: 6.65, start: "2025-06-01", end: "2027-05-31", status: "active" },  // 6801-16-16-NWO-FG
    { planId: planMHF.id, itemIdx: 37, price: 2.90, start: "2025-06-01", end: "2027-05-31", status: "active" },  // 6400-08-08
    { planId: planMHF.id, itemIdx: 38, price: 4.25, start: "2025-06-01", end: "2027-05-31", status: "active" },  // 6400-12-12
    { planId: planMHF.id, itemIdx: 39, price: 5.80, start: "2025-06-01", end: "2027-05-31", status: "active" },  // 6400-16-16
    { planId: planMHF.id, itemIdx: 40, price: 7.10, start: "2025-06-01", end: "2027-05-31", status: "active" },  // 6502-12-12
    { planId: planMHF.id, itemIdx: 41, price: 9.45, start: "2025-06-01", end: "2027-05-31", status: "active" },  // 6502-16-16
  ];

  for (const r of recordData) {
    await prisma.rebateRecord.upsert({
      where: { rebatePlanId_itemId_startDate: { rebatePlanId: r.planId, itemId: items[r.itemIdx].id, startDate: new Date(r.start) } },
      update: {},
      create: {
        rebatePlanId: r.planId,
        itemId: items[r.itemIdx].id,
        rebatePrice: r.price,
        startDate: new Date(r.start),
        endDate: r.end ? new Date(r.end) : null,
        status: r.status,
        createdById: manager.id,
        updatedById: manager.id,
      },
    });
  }

  // ==========================================================================
  // EXPANDED SEED DATA
  // ==========================================================================

  // --- Additional End Users ---
  const volvo = await prisma.endUser.upsert({
    where: { code: "VOLVO" },
    update: {},
    create: { code: "VOLVO", name: "Volvo Construction Equipment" },
  });

  const caseEU = await prisma.endUser.upsert({
    where: { code: "CASE" },
    update: {},
    create: { code: "CASE", name: "Case Construction" },
  });

  const kubota = await prisma.endUser.upsert({
    where: { code: "KUBOTA" },
    update: {},
    create: { code: "KUBOTA", name: "Kubota" },
  });

  const terex = await prisma.endUser.upsert({
    where: { code: "TEREX" },
    update: {},
    create: { code: "TEREX", name: "Terex Corporation" },
  });

  // --- Contracts for HSC, AIT, LGG, TIPCO ---
  // HSC / Volvo (active)
  const contractHSC1 = await prisma.contract.upsert({
    where: { distributorId_endUserId_contractNumber: { distributorId: hsc.id, endUserId: volvo.id, contractNumber: "103200" } },
    update: {},
    create: {
      distributorId: hsc.id, endUserId: volvo.id, contractNumber: "103200",
      description: "HSC / Volvo hydraulic fittings program",
      startDate: new Date("2024-07-01"), endDate: new Date("2027-06-30"), status: "active",
    },
  });

  // HSC / Case (expired)
  const contractHSC2 = await prisma.contract.upsert({
    where: { distributorId_endUserId_contractNumber: { distributorId: hsc.id, endUserId: caseEU.id, contractNumber: "103210" } },
    update: {},
    create: {
      distributorId: hsc.id, endUserId: caseEU.id, contractNumber: "103210",
      description: "HSC / Case adapters & couplings",
      startDate: new Date("2023-01-01"), endDate: new Date("2025-06-30"), status: "expired",
    },
  });

  // AIT / Kubota (active)
  const contractAIT1 = await prisma.contract.upsert({
    where: { distributorId_endUserId_contractNumber: { distributorId: ait.id, endUserId: kubota.id, contractNumber: "103500" } },
    update: {},
    create: {
      distributorId: ait.id, endUserId: kubota.id, contractNumber: "103500",
      description: "AIT / Kubota stainless steel program",
      startDate: new Date("2025-01-01"), endDate: new Date("2027-12-31"), status: "active",
    },
  });

  // AIT / Terex (active)
  const contractAIT2 = await prisma.contract.upsert({
    where: { distributorId_endUserId_contractNumber: { distributorId: ait.id, endUserId: terex.id, contractNumber: "103510" } },
    update: {},
    create: {
      distributorId: ait.id, endUserId: terex.id, contractNumber: "103510",
      description: "AIT / Terex hydraulic fittings",
      startDate: new Date("2024-06-01"), endDate: new Date("2026-05-31"), status: "active",
    },
  });

  // LGG / Deere (active)
  const contractLGG1 = await prisma.contract.upsert({
    where: { distributorId_endUserId_contractNumber: { distributorId: lgg.id, endUserId: deere.id, contractNumber: "104100" } },
    update: {},
    create: {
      distributorId: lgg.id, endUserId: deere.id, contractNumber: "104100",
      description: "LGG / John Deere coupling & adapter program",
      startDate: new Date("2025-03-01"), endDate: new Date("2028-02-28"), status: "active",
    },
  });

  // LGG / Cat (expired)
  const contractLGG2 = await prisma.contract.upsert({
    where: { distributorId_endUserId_contractNumber: { distributorId: lgg.id, endUserId: cat.id, contractNumber: "104110" } },
    update: {},
    create: {
      distributorId: lgg.id, endUserId: cat.id, contractNumber: "104110",
      description: "LGG / Caterpillar legacy fittings",
      startDate: new Date("2022-01-01"), endDate: new Date("2024-12-31"), status: "expired",
    },
  });

  // TIPCO / Volvo (active)
  const contractTIPCO1 = await prisma.contract.upsert({
    where: { distributorId_endUserId_contractNumber: { distributorId: tipco.id, endUserId: volvo.id, contractNumber: "104500" } },
    update: {},
    create: {
      distributorId: tipco.id, endUserId: volvo.id, contractNumber: "104500",
      description: "TIPCO / Volvo high-pressure fittings",
      startDate: new Date("2025-01-01"), endDate: new Date("2027-12-31"), status: "active",
    },
  });

  // TIPCO / Komatsu (active)
  const contractTIPCO2 = await prisma.contract.upsert({
    where: { distributorId_endUserId_contractNumber: { distributorId: tipco.id, endUserId: komatsu.id, contractNumber: "104510" } },
    update: {},
    create: {
      distributorId: tipco.id, endUserId: komatsu.id, contractNumber: "104510",
      description: "TIPCO / Komatsu OEM replacement program",
      startDate: new Date("2024-04-01"), endDate: new Date("2026-03-31"), status: "active",
    },
  });

  // --- Rebate Plans for new contracts ---
  const planHSC_HYD = await prisma.rebatePlan.upsert({
    where: { contractId_planCode: { contractId: contractHSC1.id, planCode: "HYD" } },
    update: {},
    create: { contractId: contractHSC1.id, planCode: "HYD", planName: "Hydraulic Fittings", discountType: "part", status: "active" },
  });

  const planHSC_ADP = await prisma.rebatePlan.upsert({
    where: { contractId_planCode: { contractId: contractHSC2.id, planCode: "ADP" } },
    update: {},
    create: { contractId: contractHSC2.id, planCode: "ADP", planName: "Adapters & Couplings", discountType: "product_code", status: "expired" },
  });

  const planAIT_SS = await prisma.rebatePlan.upsert({
    where: { contractId_planCode: { contractId: contractAIT1.id, planCode: "SS" } },
    update: {},
    create: { contractId: contractAIT1.id, planCode: "SS", planName: "Stainless Steel Program", discountType: "part", status: "active" },
  });

  const planAIT_HYD = await prisma.rebatePlan.upsert({
    where: { contractId_planCode: { contractId: contractAIT2.id, planCode: "HYD" } },
    update: {},
    create: { contractId: contractAIT2.id, planCode: "HYD", planName: "Hydraulic Fittings", discountType: "part", status: "active" },
  });

  const planLGG_CPL = await prisma.rebatePlan.upsert({
    where: { contractId_planCode: { contractId: contractLGG1.id, planCode: "CPL" } },
    update: {},
    create: { contractId: contractLGG1.id, planCode: "CPL", planName: "Couplings & Adapters", discountType: "part", status: "active" },
  });

  const planLGG_FIT = await prisma.rebatePlan.upsert({
    where: { contractId_planCode: { contractId: contractLGG2.id, planCode: "FIT" } },
    update: {},
    create: { contractId: contractLGG2.id, planCode: "FIT", planName: "General Fittings", discountType: "product_code", status: "expired" },
  });

  const planTIPCO_HP = await prisma.rebatePlan.upsert({
    where: { contractId_planCode: { contractId: contractTIPCO1.id, planCode: "HP" } },
    update: {},
    create: { contractId: contractTIPCO1.id, planCode: "HP", planName: "High-Pressure Fittings", discountType: "part", status: "active" },
  });

  const planTIPCO_OEM = await prisma.rebatePlan.upsert({
    where: { contractId_planCode: { contractId: contractTIPCO2.id, planCode: "OEM" } },
    update: {},
    create: { contractId: contractTIPCO2.id, planCode: "OEM", planName: "OEM Replacement Parts", discountType: "product_code", status: "active" },
  });

  // --- Additional Items (~20 new) ---
  const newItems = await Promise.all([
    prisma.item.upsert({ where: { itemNumber: "6800-08-08" }, update: {}, create: { itemNumber: "6800-08-08", description: "1/2\" Male ORB x 1/2\" Male ORB Straight", productCode: "HYD" } }),
    prisma.item.upsert({ where: { itemNumber: "6800-12-12" }, update: {}, create: { itemNumber: "6800-12-12", description: "3/4\" Male ORB x 3/4\" Male ORB Straight", productCode: "HYD" } }),
    prisma.item.upsert({ where: { itemNumber: "6800-16-16" }, update: {}, create: { itemNumber: "6800-16-16", description: "1\" Male ORB x 1\" Male ORB Straight", productCode: "HYD" } }),
    prisma.item.upsert({ where: { itemNumber: "6800-20-20" }, update: {}, create: { itemNumber: "6800-20-20", description: "1-1/4\" Male ORB x 1-1/4\" Male ORB Straight", productCode: "HYD" } }),
    prisma.item.upsert({ where: { itemNumber: "4400-08-08" }, update: {}, create: { itemNumber: "4400-08-08", description: "1/2\" Female JIC x 1/2\" Female JIC Coupling", productCode: "CPL" } }),
    prisma.item.upsert({ where: { itemNumber: "4400-12-12" }, update: {}, create: { itemNumber: "4400-12-12", description: "3/4\" Female JIC x 3/4\" Female JIC Coupling", productCode: "CPL" } }),
    prisma.item.upsert({ where: { itemNumber: "4400-16-16" }, update: {}, create: { itemNumber: "4400-16-16", description: "1\" Female JIC x 1\" Female JIC Coupling", productCode: "CPL" } }),
    prisma.item.upsert({ where: { itemNumber: "4404-08-08" }, update: {}, create: { itemNumber: "4404-08-08", description: "1/2\" Female JIC 90 Elbow Coupling", productCode: "CPL" } }),
    prisma.item.upsert({ where: { itemNumber: "4404-12-12" }, update: {}, create: { itemNumber: "4404-12-12", description: "3/4\" Female JIC 90 Elbow Coupling", productCode: "CPL" } }),
    prisma.item.upsert({ where: { itemNumber: "SS-6800-08-08" }, update: {}, create: { itemNumber: "SS-6800-08-08", description: "SS 1/2\" Male ORB Straight Adapter", productCode: "SS" } }),
    prisma.item.upsert({ where: { itemNumber: "SS-6800-12-12" }, update: {}, create: { itemNumber: "SS-6800-12-12", description: "SS 3/4\" Male ORB Straight Adapter", productCode: "SS" } }),
    prisma.item.upsert({ where: { itemNumber: "SS-6801-08-08" }, update: {}, create: { itemNumber: "SS-6801-08-08", description: "SS 1/2\" Male ORB 90 Elbow", productCode: "SS" } }),
    prisma.item.upsert({ where: { itemNumber: "SS-6801-12-12" }, update: {}, create: { itemNumber: "SS-6801-12-12", description: "SS 3/4\" Male ORB 90 Elbow", productCode: "SS" } }),
    prisma.item.upsert({ where: { itemNumber: "SS-4400-08-08" }, update: {}, create: { itemNumber: "SS-4400-08-08", description: "SS 1/2\" Female JIC Coupling", productCode: "SS" } }),
    prisma.item.upsert({ where: { itemNumber: "7000-08-08" }, update: {}, create: { itemNumber: "7000-08-08", description: "1/2\" Code 61 Flange Straight", productCode: "HP" } }),
    prisma.item.upsert({ where: { itemNumber: "7000-12-12" }, update: {}, create: { itemNumber: "7000-12-12", description: "3/4\" Code 61 Flange Straight", productCode: "HP" } }),
    prisma.item.upsert({ where: { itemNumber: "7000-16-16" }, update: {}, create: { itemNumber: "7000-16-16", description: "1\" Code 61 Flange Straight", productCode: "HP" } }),
    prisma.item.upsert({ where: { itemNumber: "7001-12-12" }, update: {}, create: { itemNumber: "7001-12-12", description: "3/4\" Code 61 Flange 90 Elbow", productCode: "HP" } }),
    prisma.item.upsert({ where: { itemNumber: "7001-16-16" }, update: {}, create: { itemNumber: "7001-16-16", description: "1\" Code 61 Flange 90 Elbow", productCode: "HP" } }),
    prisma.item.upsert({ where: { itemNumber: "7002-20-20" }, update: {}, create: { itemNumber: "7002-20-20", description: "1-1/4\" Code 62 Flange Tee", productCode: "HP" } }),
  ]);

  // --- New Rebate Records with status variety ---
  // Helper: newItems indices map to items above (0=6800-08-08, 1=6800-12-12, etc.)

  // ---- HSC / Volvo (planHSC_HYD) - Active records ----
  const hscHydRecords = [
    { planId: planHSC_HYD.id, itemId: newItems[0].id, price: 3.25, start: "2024-07-01", end: "2027-06-30", status: "active" },
    { planId: planHSC_HYD.id, itemId: newItems[1].id, price: 4.80, start: "2024-07-01", end: "2027-06-30", status: "active" },
    { planId: planHSC_HYD.id, itemId: newItems[2].id, price: 6.10, start: "2024-07-01", end: "2027-06-30", status: "active" },
    { planId: planHSC_HYD.id, itemId: newItems[3].id, price: 8.45, start: "2024-07-01", end: "2027-06-30", status: "active" },
    { planId: planHSC_HYD.id, itemId: items[3].id, price: 1.35, start: "2024-07-01", end: "2027-06-30", status: "active" },   // 1100-C-12
    { planId: planHSC_HYD.id, itemId: items[4].id, price: 1.65, start: "2024-07-01", end: "2027-06-30", status: "active" },   // 1100-D-16
  ];

  // ---- HSC / Case (planHSC_ADP) - Expired records ----
  const hscAdpRecords = [
    { planId: planHSC_ADP.id, itemId: newItems[4].id, price: 5.50, start: "2023-01-01", end: "2025-06-30", status: "expired" },
    { planId: planHSC_ADP.id, itemId: newItems[5].id, price: 7.20, start: "2023-01-01", end: "2025-06-30", status: "expired" },
    { planId: planHSC_ADP.id, itemId: newItems[6].id, price: 9.80, start: "2023-01-01", end: "2025-06-30", status: "expired" },
    { planId: planHSC_ADP.id, itemId: newItems[7].id, price: 6.90, start: "2023-01-01", end: "2025-06-30", status: "expired" },
    { planId: planHSC_ADP.id, itemId: newItems[8].id, price: 8.75, start: "2023-01-01", end: "2025-06-30", status: "expired" },
  ];

  // ---- AIT / Kubota (planAIT_SS) - Active + Draft + Future records ----
  const aitSsRecords = [
    { planId: planAIT_SS.id, itemId: newItems[9].id, price: 8.50, start: "2025-01-01", end: "2027-12-31", status: "active" },
    { planId: planAIT_SS.id, itemId: newItems[10].id, price: 12.40, start: "2025-01-01", end: "2027-12-31", status: "active" },
    { planId: planAIT_SS.id, itemId: newItems[11].id, price: 10.20, start: "2025-01-01", end: "2027-12-31", status: "active" },
    { planId: planAIT_SS.id, itemId: newItems[12].id, price: 14.80, start: "2025-01-01", end: "2027-12-31", status: "active" },
    { planId: planAIT_SS.id, itemId: newItems[13].id, price: 11.90, start: "2025-01-01", end: "2027-12-31", status: "active" },
    // Draft records (not yet finalized)
    { planId: planAIT_SS.id, itemId: newItems[0].id, price: 7.75, start: "2025-06-01", end: "2027-12-31", status: "draft" },
    { planId: planAIT_SS.id, itemId: newItems[1].id, price: 10.50, start: "2025-06-01", end: "2027-12-31", status: "draft" },
    // Future records (start in 2027)
    { planId: planAIT_SS.id, itemId: newItems[9].id, price: 9.25, start: "2027-01-01", end: "2028-12-31", status: "future" },
    { planId: planAIT_SS.id, itemId: newItems[10].id, price: 13.50, start: "2027-01-01", end: "2028-12-31", status: "future" },
  ];

  // ---- AIT / Terex (planAIT_HYD) - Active + Cancelled ----
  const aitHydRecords = [
    { planId: planAIT_HYD.id, itemId: newItems[0].id, price: 3.40, start: "2024-06-01", end: "2026-05-31", status: "active" },
    { planId: planAIT_HYD.id, itemId: newItems[1].id, price: 5.10, start: "2024-06-01", end: "2026-05-31", status: "active" },
    { planId: planAIT_HYD.id, itemId: newItems[2].id, price: 6.55, start: "2024-06-01", end: "2026-05-31", status: "active" },
    { planId: planAIT_HYD.id, itemId: newItems[3].id, price: 8.90, start: "2024-06-01", end: "2026-05-31", status: "active" },
    { planId: planAIT_HYD.id, itemId: items[34].id, price: 4.10, start: "2024-06-01", end: "2026-05-31", status: "active" },   // 6801-08-08-NWO-FG
    // Cancelled records
    { planId: planAIT_HYD.id, itemId: items[35].id, price: 5.80, start: "2024-06-01", end: "2026-05-31", status: "cancelled" },
    { planId: planAIT_HYD.id, itemId: items[36].id, price: 7.00, start: "2024-06-01", end: "2026-05-31", status: "cancelled" },
  ];

  // ---- LGG / Deere (planLGG_CPL) - Active + Open-ended + Future ----
  const lggCplRecords = [
    { planId: planLGG_CPL.id, itemId: newItems[4].id, price: 5.80, start: "2025-03-01", end: "2028-02-28", status: "active" },
    { planId: planLGG_CPL.id, itemId: newItems[5].id, price: 7.60, start: "2025-03-01", end: "2028-02-28", status: "active" },
    { planId: planLGG_CPL.id, itemId: newItems[6].id, price: 10.25, start: "2025-03-01", end: "2028-02-28", status: "active" },
    { planId: planLGG_CPL.id, itemId: newItems[7].id, price: 7.15, start: "2025-03-01", end: "2028-02-28", status: "active" },
    { planId: planLGG_CPL.id, itemId: newItems[8].id, price: 9.30, start: "2025-03-01", end: "2028-02-28", status: "active" },
    // Open-ended records (no end date)
    { planId: planLGG_CPL.id, itemId: newItems[0].id, price: 3.50, start: "2025-03-01", end: null, status: "active" },
    { planId: planLGG_CPL.id, itemId: newItems[1].id, price: 5.20, start: "2025-03-01", end: null, status: "active" },
    // Future records
    { planId: planLGG_CPL.id, itemId: newItems[4].id, price: 6.20, start: "2027-03-01", end: "2029-02-28", status: "future" },
    { planId: planLGG_CPL.id, itemId: newItems[5].id, price: 8.10, start: "2027-03-01", end: "2029-02-28", status: "future" },
  ];

  // ---- LGG / Cat (planLGG_FIT) - Expired ----
  const lggFitRecords = [
    { planId: planLGG_FIT.id, itemId: items[3].id, price: 1.10, start: "2022-01-01", end: "2024-12-31", status: "expired" },
    { planId: planLGG_FIT.id, itemId: items[4].id, price: 1.40, start: "2022-01-01", end: "2024-12-31", status: "expired" },
    { planId: planLGG_FIT.id, itemId: items[6].id, price: 0.90, start: "2022-01-01", end: "2024-12-31", status: "expired" },
    { planId: planLGG_FIT.id, itemId: items[7].id, price: 0.55, start: "2022-01-01", end: "2024-12-31", status: "expired" },
  ];

  // ---- TIPCO / Volvo (planTIPCO_HP) - Active + Draft ----
  const tipcoHpRecords = [
    { planId: planTIPCO_HP.id, itemId: newItems[14].id, price: 15.50, start: "2025-01-01", end: "2027-12-31", status: "active" },
    { planId: planTIPCO_HP.id, itemId: newItems[15].id, price: 22.40, start: "2025-01-01", end: "2027-12-31", status: "active" },
    { planId: planTIPCO_HP.id, itemId: newItems[16].id, price: 28.75, start: "2025-01-01", end: "2027-12-31", status: "active" },
    { planId: planTIPCO_HP.id, itemId: newItems[17].id, price: 26.30, start: "2025-01-01", end: "2027-12-31", status: "active" },
    { planId: planTIPCO_HP.id, itemId: newItems[18].id, price: 31.50, start: "2025-01-01", end: "2027-12-31", status: "active" },
    { planId: planTIPCO_HP.id, itemId: newItems[19].id, price: 45.80, start: "2025-01-01", end: "2027-12-31", status: "active" },
    // Drafts pending approval
    { planId: planTIPCO_HP.id, itemId: newItems[0].id, price: 3.90, start: "2026-01-01", end: "2027-12-31", status: "draft" },
    { planId: planTIPCO_HP.id, itemId: newItems[1].id, price: 5.60, start: "2026-01-01", end: "2027-12-31", status: "draft" },
    { planId: planTIPCO_HP.id, itemId: newItems[2].id, price: 7.30, start: "2026-01-01", end: "2027-12-31", status: "draft" },
  ];

  // ---- TIPCO / Komatsu (planTIPCO_OEM) - Active + Cancelled + Open-ended ----
  const tipcoOemRecords = [
    { planId: planTIPCO_OEM.id, itemId: items[37].id, price: 3.15, start: "2024-04-01", end: "2026-03-31", status: "active" },
    { planId: planTIPCO_OEM.id, itemId: items[38].id, price: 4.50, start: "2024-04-01", end: "2026-03-31", status: "active" },
    { planId: planTIPCO_OEM.id, itemId: items[39].id, price: 6.10, start: "2024-04-01", end: "2026-03-31", status: "active" },
    { planId: planTIPCO_OEM.id, itemId: items[40].id, price: 7.40, start: "2024-04-01", end: "2026-03-31", status: "active" },
    { planId: planTIPCO_OEM.id, itemId: items[41].id, price: 9.90, start: "2024-04-01", end: "2026-03-31", status: "active" },
    // Cancelled
    { planId: planTIPCO_OEM.id, itemId: newItems[0].id, price: 3.60, start: "2024-04-01", end: "2026-03-31", status: "cancelled" },
    // Open-ended
    { planId: planTIPCO_OEM.id, itemId: newItems[2].id, price: 6.80, start: "2024-04-01", end: null, status: "active" },
    { planId: planTIPCO_OEM.id, itemId: newItems[3].id, price: 9.20, start: "2024-04-01", end: null, status: "active" },
  ];

  // ---- Additional FAS records: Future + Cancelled ----
  const fasExtraRecords = [
    // Future pricing for FAS/HYD plan
    { planId: planHYD.id, itemId: items[3].id, price: 1.35, start: "2027-03-01", end: "2028-02-28", status: "future" },
    // Cancelled FAS/OSW records
    { planId: planOSW.id, itemId: items[6].id, price: 0.85, start: "2024-01-01", end: "2026-12-31", status: "cancelled" },
  ];

  // ---- Additional Motion records: Draft + Future ----
  const motionExtraRecords = [
    // Draft for Motion/BRG
    { planId: planBRG.id, itemId: items[5].id, price: 0.72, start: "2026-01-01", end: "2027-12-31", status: "draft" },
    // Future for Motion/MHF
    { planId: planMHF.id, itemId: newItems[0].id, price: 3.95, start: "2027-06-01", end: "2029-05-31", status: "future" },
    { planId: planMHF.id, itemId: newItems[1].id, price: 5.40, start: "2027-06-01", end: "2029-05-31", status: "future" },
  ];

  // Insert all new records
  const allNewRecords = [
    ...hscHydRecords, ...hscAdpRecords, ...aitSsRecords, ...aitHydRecords,
    ...lggCplRecords, ...lggFitRecords, ...tipcoHpRecords, ...tipcoOemRecords,
    ...fasExtraRecords, ...motionExtraRecords,
  ];

  const createdRecordIds: number[] = [];
  for (const r of allNewRecords) {
    const record = await prisma.rebateRecord.upsert({
      where: { rebatePlanId_itemId_startDate: { rebatePlanId: r.planId, itemId: r.itemId, startDate: new Date(r.start) } },
      update: {},
      create: {
        rebatePlanId: r.planId,
        itemId: r.itemId,
        rebatePrice: r.price,
        startDate: new Date(r.start),
        endDate: r.end ? new Date(r.end) : null,
        status: r.status,
        createdById: manager.id,
        updatedById: manager.id,
      },
    });
    createdRecordIds.push(record.id);
  }

  // --- Superseded Records ---
  // Create old records that are superseded by newer ones.
  // Pattern: old record (expired/end-dated) -> new record (active) with supersededById link.

  // Supersession 1: HSC/HYD 6800-08-08 — old price $2.90, superseded by current $3.25
  const supersededRec1 = await prisma.rebateRecord.upsert({
    where: { rebatePlanId_itemId_startDate: { rebatePlanId: planHSC_HYD.id, itemId: newItems[0].id, startDate: new Date("2023-07-01") } },
    update: {},
    create: {
      rebatePlanId: planHSC_HYD.id,
      itemId: newItems[0].id,
      rebatePrice: 2.90,
      startDate: new Date("2023-07-01"),
      endDate: new Date("2024-06-30"),
      status: "superseded",
      createdById: manager.id,
      updatedById: manager.id,
    },
  });
  // Link: find the active record for same plan+item and set supersededById
  const activeHsc1 = await prisma.rebateRecord.findUnique({
    where: { rebatePlanId_itemId_startDate: { rebatePlanId: planHSC_HYD.id, itemId: newItems[0].id, startDate: new Date("2024-07-01") } },
  });
  if (activeHsc1) {
    await prisma.rebateRecord.update({
      where: { id: supersededRec1.id },
      data: { supersededById: activeHsc1.id },
    });
  }

  // Supersession 2: HSC/HYD 6800-12-12 — old price $4.20, superseded by current $4.80
  const supersededRec2 = await prisma.rebateRecord.upsert({
    where: { rebatePlanId_itemId_startDate: { rebatePlanId: planHSC_HYD.id, itemId: newItems[1].id, startDate: new Date("2023-07-01") } },
    update: {},
    create: {
      rebatePlanId: planHSC_HYD.id,
      itemId: newItems[1].id,
      rebatePrice: 4.20,
      startDate: new Date("2023-07-01"),
      endDate: new Date("2024-06-30"),
      status: "superseded",
      createdById: manager.id,
      updatedById: manager.id,
    },
  });
  const activeHsc2 = await prisma.rebateRecord.findUnique({
    where: { rebatePlanId_itemId_startDate: { rebatePlanId: planHSC_HYD.id, itemId: newItems[1].id, startDate: new Date("2024-07-01") } },
  });
  if (activeHsc2) {
    await prisma.rebateRecord.update({
      where: { id: supersededRec2.id },
      data: { supersededById: activeHsc2.id },
    });
  }

  // Supersession 3: TIPCO/HP 7000-08-08 — old price $13.80, superseded by current $15.50
  const supersededRec3 = await prisma.rebateRecord.upsert({
    where: { rebatePlanId_itemId_startDate: { rebatePlanId: planTIPCO_HP.id, itemId: newItems[14].id, startDate: new Date("2024-01-01") } },
    update: {},
    create: {
      rebatePlanId: planTIPCO_HP.id,
      itemId: newItems[14].id,
      rebatePrice: 13.80,
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-12-31"),
      status: "superseded",
      createdById: admin.id,
      updatedById: admin.id,
    },
  });
  const activeTipco1 = await prisma.rebateRecord.findUnique({
    where: { rebatePlanId_itemId_startDate: { rebatePlanId: planTIPCO_HP.id, itemId: newItems[14].id, startDate: new Date("2025-01-01") } },
  });
  if (activeTipco1) {
    await prisma.rebateRecord.update({
      where: { id: supersededRec3.id },
      data: { supersededById: activeTipco1.id },
    });
  }

  // Supersession 4: TIPCO/HP 7000-12-12 — old price $19.50, superseded by current $22.40
  const supersededRec4 = await prisma.rebateRecord.upsert({
    where: { rebatePlanId_itemId_startDate: { rebatePlanId: planTIPCO_HP.id, itemId: newItems[15].id, startDate: new Date("2024-01-01") } },
    update: {},
    create: {
      rebatePlanId: planTIPCO_HP.id,
      itemId: newItems[15].id,
      rebatePrice: 19.50,
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-12-31"),
      status: "superseded",
      createdById: admin.id,
      updatedById: admin.id,
    },
  });
  const activeTipco2 = await prisma.rebateRecord.findUnique({
    where: { rebatePlanId_itemId_startDate: { rebatePlanId: planTIPCO_HP.id, itemId: newItems[15].id, startDate: new Date("2025-01-01") } },
  });
  if (activeTipco2) {
    await prisma.rebateRecord.update({
      where: { id: supersededRec4.id },
      data: { supersededById: activeTipco2.id },
    });
  }

  // Supersession 5: AIT/HYD 6800-08-08 — old price $2.85, superseded by current $3.40
  const supersededRec5 = await prisma.rebateRecord.upsert({
    where: { rebatePlanId_itemId_startDate: { rebatePlanId: planAIT_HYD.id, itemId: newItems[0].id, startDate: new Date("2023-06-01") } },
    update: {},
    create: {
      rebatePlanId: planAIT_HYD.id,
      itemId: newItems[0].id,
      rebatePrice: 2.85,
      startDate: new Date("2023-06-01"),
      endDate: new Date("2024-05-31"),
      status: "superseded",
      createdById: manager.id,
      updatedById: manager.id,
    },
  });
  const activeAit1 = await prisma.rebateRecord.findUnique({
    where: { rebatePlanId_itemId_startDate: { rebatePlanId: planAIT_HYD.id, itemId: newItems[0].id, startDate: new Date("2024-06-01") } },
  });
  if (activeAit1) {
    await prisma.rebateRecord.update({
      where: { id: supersededRec5.id },
      data: { supersededById: activeAit1.id },
    });
  }

  // --- Record Notes ---
  // Use createdRecordIds to reference recently created records
  const noteTargets = [
    { recordIdx: 0, noteType: "general", text: "Pricing confirmed by Volvo purchasing department via email 2024-06-15." },
    { recordIdx: 5, noteType: "general", text: "Cross-referenced with HSC contract renewal terms. Price matches PO #HSC-2024-4421." },
    { recordIdx: 11, noteType: "pricing", text: "SS pricing includes 15% material surcharge per Q1 2025 stainless steel index." },
    { recordIdx: 14, noteType: "general", text: "Kubota requested review of SS elbow pricing for next contract period." },
    { recordIdx: 20, noteType: "general", text: "Terex account manager confirmed cancellation — switching to competitor supplier for these items." },
    { recordIdx: 25, noteType: "pricing", text: "Open-ended record: LGG/Deere agreed to hold pricing until next annual review." },
    { recordIdx: 30, noteType: "general", text: "TIPCO high-pressure flange pricing based on 2025 catalog less 35% distributor discount." },
    { recordIdx: 35, noteType: "general", text: "Draft pending VP approval — new HP items added per TIPCO request dated 2025-11-20." },
    { recordIdx: 40, noteType: "pricing", text: "TIPCO/Komatsu OEM pricing aligned with Komatsu global parts agreement GP-2024-100." },
    { recordIdx: 45, noteType: "general", text: "Cancelled: Komatsu consolidated these items under direct-ship program effective 2025-Q2." },
  ];

  for (const n of noteTargets) {
    if (n.recordIdx < createdRecordIds.length) {
      await prisma.recordNote.create({
        data: {
          rebateRecordId: createdRecordIds[n.recordIdx],
          noteType: n.noteType,
          noteText: n.text,
          createdById: n.recordIdx % 2 === 0 ? admin.id : manager.id,
        },
      });
    }
  }

  // --- Audit Log Entries ---
  // Simulate realistic activity: record creates, updates, price changes, cancellations
  const auditEntries = [
    {
      tableName: "rebate_records", recordId: createdRecordIds[0] || 1, action: "INSERT",
      changedFields: { rebatePrice: { old: null, new: "3.2500" }, status: { old: null, new: "active" } },
      userId: manager.id, createdAt: new Date("2024-06-20T14:30:00Z"),
    },
    {
      tableName: "rebate_records", recordId: createdRecordIds[1] || 2, action: "INSERT",
      changedFields: { rebatePrice: { old: null, new: "4.8000" }, status: { old: null, new: "active" } },
      userId: manager.id, createdAt: new Date("2024-06-20T14:31:00Z"),
    },
    {
      tableName: "contracts", recordId: contractHSC1.id, action: "INSERT",
      changedFields: { contractNumber: { old: null, new: "103200" }, description: { old: null, new: "HSC / Volvo hydraulic fittings program" } },
      userId: admin.id, createdAt: new Date("2024-06-15T10:00:00Z"),
    },
    {
      tableName: "rebate_records", recordId: createdRecordIds[11] || 12, action: "INSERT",
      changedFields: { rebatePrice: { old: null, new: "8.5000" }, status: { old: null, new: "active" } },
      userId: admin.id, createdAt: new Date("2025-01-05T09:15:00Z"),
    },
    {
      tableName: "rebate_records", recordId: supersededRec1.id, action: "UPDATE",
      changedFields: { status: { old: "active", new: "superseded" }, endDate: { old: null, new: "2024-06-30" } },
      userId: manager.id, createdAt: new Date("2024-07-01T08:00:00Z"),
    },
    {
      tableName: "rebate_records", recordId: supersededRec3.id, action: "UPDATE",
      changedFields: { status: { old: "active", new: "superseded" }, rebatePrice: { old: "13.8000", new: "13.8000" } },
      userId: admin.id, createdAt: new Date("2025-01-01T00:05:00Z"),
    },
    {
      tableName: "rebate_records", recordId: createdRecordIds[20] || 21, action: "UPDATE",
      changedFields: { status: { old: "active", new: "cancelled" } },
      userId: manager.id, createdAt: new Date("2025-02-10T11:45:00Z"),
    },
    {
      tableName: "contracts", recordId: contractAIT2.id, action: "INSERT",
      changedFields: { contractNumber: { old: null, new: "103510" }, description: { old: null, new: "AIT / Terex hydraulic fittings" } },
      userId: admin.id, createdAt: new Date("2024-05-20T16:00:00Z"),
    },
    {
      tableName: "rebate_records", recordId: createdRecordIds[30] || 31, action: "INSERT",
      changedFields: { rebatePrice: { old: null, new: "15.5000" }, status: { old: null, new: "active" } },
      userId: admin.id, createdAt: new Date("2025-01-02T10:30:00Z"),
    },
    {
      tableName: "rebate_records", recordId: createdRecordIds[35] || 36, action: "INSERT",
      changedFields: { rebatePrice: { old: null, new: "3.9000" }, status: { old: null, new: "draft" } },
      userId: manager.id, createdAt: new Date("2025-11-25T13:20:00Z"),
    },
    {
      tableName: "contracts", recordId: contractLGG1.id, action: "INSERT",
      changedFields: { contractNumber: { old: null, new: "104100" }, description: { old: null, new: "LGG / John Deere coupling & adapter program" } },
      userId: admin.id, createdAt: new Date("2025-02-15T09:00:00Z"),
    },
    {
      tableName: "rebate_records", recordId: createdRecordIds[25] || 26, action: "UPDATE",
      changedFields: { endDate: { old: "2026-02-28", new: null }, noteText: "Changed to open-ended per LGG agreement" },
      userId: manager.id, createdAt: new Date("2025-04-10T15:30:00Z"),
    },
    {
      tableName: "items", recordId: newItems[14].id, action: "INSERT",
      changedFields: { itemNumber: { old: null, new: "7000-08-08" }, description: { old: null, new: "1/2\" Code 61 Flange Straight" } },
      userId: admin.id, createdAt: new Date("2024-12-20T11:00:00Z"),
    },
    {
      tableName: "rebate_records", recordId: createdRecordIds[45] || 46, action: "UPDATE",
      changedFields: { status: { old: "active", new: "cancelled" }, reason: "Komatsu consolidated under direct-ship program" },
      userId: admin.id, createdAt: new Date("2025-03-15T14:00:00Z"),
    },
    {
      tableName: "contracts", recordId: contractTIPCO1.id, action: "UPDATE",
      changedFields: { endDate: { old: "2026-12-31", new: "2027-12-31" }, description: { old: "TIPCO / Volvo fittings", new: "TIPCO / Volvo high-pressure fittings" } },
      userId: admin.id, createdAt: new Date("2025-01-10T09:45:00Z"),
    },
  ];

  for (const entry of auditEntries) {
    await prisma.auditLog.create({
      data: {
        tableName: entry.tableName,
        recordId: entry.recordId,
        action: entry.action,
        changedFields: entry.changedFields,
        userId: entry.userId,
        createdAt: entry.createdAt,
      },
    });
  }

  console.log("Seed complete.");
  console.log("  Users: admin/admin123, jwood/manager123, viewer/viewer123");
  console.log("  Distributors: FAS, MOTION, HSC, AIT, LGG, TIPCO");
  console.log("  End Users: LINK-BELT, CAT, DEERE, KOMATSU, VOLVO, CASE, KUBOTA, TEREX");
  console.log(`  Contracts: 12 | Plans: 12 | Items: ${items.length + newItems.length}`);
  console.log(`  Records: ${recordData.length + allNewRecords.length + 5} (incl. 5 superseded)`);
  console.log("  Notes: 10 | Audit entries: 15");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
