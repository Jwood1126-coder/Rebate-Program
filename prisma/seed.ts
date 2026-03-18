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

  await prisma.endUser.upsert({
    where: { code: "VOLVO" },
    update: {},
    create: { code: "VOLVO", name: "Volvo" },
  });

  await prisma.endUser.upsert({
    where: { code: "CASE" },
    update: {},
    create: { code: "CASE", name: "Case Construction" },
  });

  await prisma.endUser.upsert({
    where: { code: "KUBOTA" },
    update: {},
    create: { code: "KUBOTA", name: "Kubota" },
  });

  await prisma.endUser.upsert({
    where: { code: "TEREX" },
    update: {},
    create: { code: "TEREX", name: "Terex" },
  });

  console.log("Seed complete.");
  console.log("  Users: admin/admin123, jwood/manager123, viewer/viewer123");
  console.log("  Distributors: FAS, MOTION, HSC, AIT, LGG, TIPCO");
  console.log("  End Users: LINK-BELT, CAT, DEERE, KOMATSU, VOLVO, CASE, KUBOTA, TEREX");
  console.log("  No contracts, items, or records — upload test data to populate.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
