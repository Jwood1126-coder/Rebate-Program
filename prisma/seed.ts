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

  console.log("Seed complete.");
  console.log("  Users: admin/admin123, jwood/manager123, viewer/viewer123");
  console.log("  Distributors: FAS, MOTION, HSC, AIT, LGG, TIPCO");
  console.log(`  Contracts: 3 | Plans: 3 | Items: ${items.length} | Records: ${recordData.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
