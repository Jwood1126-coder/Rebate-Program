#!/bin/sh

echo "=== WAITING FOR DATABASE ==="
# Retry prisma db push up to 10 times with 3 second delays
ATTEMPT=0
MAX_ATTEMPTS=10
until npx prisma db push --skip-generate --accept-data-loss 2>&1; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
    echo "ERROR: Could not connect to database after $MAX_ATTEMPTS attempts"
    exit 1
  fi
  echo "Database not ready (attempt $ATTEMPT/$MAX_ATTEMPTS), retrying in 3s..."
  sleep 3
done
echo "=== DATABASE READY ==="

echo "=== SEEDING DATABASE ==="
node -e '
const { PrismaClient } = require("@prisma/client");
const b = require("bcryptjs");
const p = new PrismaClient();

async function seed() {
  const h = b.hashSync("admin123", 10);
  const m = b.hashSync("manager123", 10);
  const t = b.hashSync("brennan2026", 10);

  const users = [
    ["system", "System", "system", h, "admin"],
    ["admin", "Admin User", "admin", h, "admin"],
    ["jwood", "J. Wood", "jwood", m, "rebate_manager"],
    ["scott", "Scott", "scott", t, "rebate_manager"],
    ["mark", "Mark", "mark", t, "rebate_manager"],
    ["dale", "Dale", "dale", t, "rebate_manager"],
    ["scrima", "Scrima", "scrima", t, "rebate_manager"],
  ];

  for (const [u, d, e, ph, r] of users) {
    await p.user.upsert({
      where: { username: u },
      update: {},
      create: { username: u, displayName: d, email: e + "@brennaninc.com", passwordHash: ph, role: r },
    });
  }

  const distributors = [
    ["FAS", "Fastenal"], ["MOTION", "Motion Industries"], ["HSC", "HSC Industrial Supply"],
    ["AIT", "AIT Supply"], ["LGG", "LGG Industrial"], ["TIPCO", "TIPCO Technologies"],
  ];
  for (const [c, n] of distributors) {
    await p.distributor.upsert({ where: { code: c }, update: {}, create: { code: c, name: n } });
  }

  const endUsers = [
    ["LINK-BELT", "Link-Belt"], ["CAT", "Caterpillar"], ["DEERE", "John Deere"],
    ["KOMATSU", "Komatsu"], ["VOLVO", "Volvo"], ["CASE", "Case Construction"],
    ["KUBOTA", "Kubota"], ["TEREX", "Terex"],
  ];
  for (const [c, n] of endUsers) {
    await p.endUser.upsert({ where: { code: c }, update: {}, create: { code: c, name: n } });
  }

  console.log("Seed complete.");
  await p.$disconnect();
}

seed().catch((e) => { console.error("Seed error:", e); process.exit(1); });
'

echo "=== STARTING SERVER ON PORT ${PORT:-3000} ==="
exec npx next start -H 0.0.0.0 -p ${PORT:-3000}
