#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma db push --skip-generate --accept-data-loss 2>&1 || true

echo "Seeding database (upsert-safe)..."
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
async function main() {
  const hash = await bcrypt.hashSync('admin123', 10);
  const mgrHash = await bcrypt.hashSync('manager123', 10);
  const testerHash = await bcrypt.hashSync('brennan2026', 10);

  // Core users
  await prisma.user.upsert({ where: { username: 'system' }, update: {}, create: { username: 'system', displayName: 'System', email: 'system@brennaninc.com', passwordHash: hash, role: 'admin' } });
  await prisma.user.upsert({ where: { username: 'admin' }, update: {}, create: { username: 'admin', displayName: 'Admin User', email: 'admin@brennaninc.com', passwordHash: hash, role: 'admin' } });
  await prisma.user.upsert({ where: { username: 'jwood' }, update: {}, create: { username: 'jwood', displayName: 'J. Wood', email: 'jwood@brennaninc.com', passwordHash: mgrHash, role: 'rebate_manager' } });

  // Testers
  await prisma.user.upsert({ where: { username: 'scott' }, update: {}, create: { username: 'scott', displayName: 'Scott', email: 'scott@brennaninc.com', passwordHash: testerHash, role: 'rebate_manager' } });
  await prisma.user.upsert({ where: { username: 'mark' }, update: {}, create: { username: 'mark', displayName: 'Mark', email: 'mark@brennaninc.com', passwordHash: testerHash, role: 'rebate_manager' } });
  await prisma.user.upsert({ where: { username: 'dale' }, update: {}, create: { username: 'dale', displayName: 'Dale', email: 'dale@brennaninc.com', passwordHash: testerHash, role: 'rebate_manager' } });
  await prisma.user.upsert({ where: { username: 'scrima' }, update: {}, create: { username: 'scrima', displayName: 'Scrima', email: 'scrima@brennaninc.com', passwordHash: testerHash, role: 'rebate_manager' } });

  // Distributors
  for (const [code, name] of [['FAS','Fastenal'],['MOTION','Motion Industries'],['HSC','HSC Industrial Supply'],['AIT','AIT Supply'],['LGG','LGG Industrial'],['TIPCO','TIPCO Technologies']]) {
    await prisma.distributor.upsert({ where: { code }, update: {}, create: { code, name } });
  }

  // End Users
  for (const [code, name] of [['LINK-BELT','Link-Belt'],['CAT','Caterpillar'],['DEERE','John Deere'],['KOMATSU','Komatsu'],['VOLVO','Volvo'],['CASE','Case Construction'],['KUBOTA','Kubota'],['TEREX','Terex']]) {
    await prisma.endUser.upsert({ where: { code }, update: {}, create: { code, name } });
  }

  console.log('Seed complete.');
  await prisma.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
" 2>&1

echo "Starting server..."
exec node server.js
