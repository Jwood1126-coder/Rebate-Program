# Disaster Recovery & Business Continuity Plan

> **Purpose:** Ensure Brennan sales operations can continue managing rebate data even if the RMS application becomes unavailable. This document covers backups, data access, manual fallback procedures, and system restoration.

---

## Quick Reference

| Scenario | Action | Time to Recover |
|----------|--------|-----------------|
| App is down, DB is fine | Restart the app: `npm run start` or redeploy | Minutes |
| Need data NOW | Use last Excel export from Settings > System > Export | Immediate |
| DB corrupted | Restore from backup: `npm run db:restore backups/<file>` | 15-30 min |
| Server destroyed | New server + restore backup + redeploy | 1-2 hours |
| Everything lost | Re-seed + re-import from last Excel export | 2-4 hours |

---

## 1. Backup Strategy

### 1.1 Application-Level Exports (Primary Safety Net)

The system provides two export formats accessible from **Settings > System > Data Export**:

- **Full Excel Export (.xlsx)** — All business tables in a single workbook with separate sheets for Distributors, End Users, Contracts, Rebate Plans, Items, Rebate Records, and a Summary sheet. This is your **most important backup** — it can be used as a manual spreadsheet fallback.

- **Records CSV** — Flat CSV of all rebate records with denormalized fields (distributor code, contract number, plan code, item number, prices, dates, status). Opens in any spreadsheet application. This is your emergency manual operations file.

**Schedule:** Download a full Excel export:
- Weekly (every Monday)
- Before any major import or bulk operation
- Before system maintenance or upgrades
- After completing a reconciliation cycle

**Storage:** Save exports to a shared network drive or cloud folder (OneDrive, SharePoint) that is accessible to the sales operations team regardless of whether the RMS server is running.

### 1.2 Database Backups (Server-Level)

Database backups use PostgreSQL's `pg_dump` utility via npm scripts:

```bash
# Create a SQL backup (default — human-readable, restorable with psql)
npm run db:backup

# Create a compressed custom-format backup (faster restore, smaller file)
npm run db:backup -- --format custom

# Keep only last 5 backups instead of default 10
npm run db:backup -- --keep 5
```

Backups are saved to the `backups/` directory with timestamps: `rms-backup-2026-03-16-143022.sql`

**Schedule:** Automate daily backups via cron:
```bash
# Daily at 2 AM
0 2 * * * cd /path/to/Rebate-Program && npm run db:backup >> /var/log/rms-backup.log 2>&1
```

### 1.3 Backup Verification

Periodically verify backups are restorable:
```bash
# Test restore to a temporary database
createdb rms_test_restore
psql rms_test_restore < backups/rms-backup-2026-03-16.sql
# Verify: psql rms_test_restore -c "SELECT count(*) FROM rebate_records;"
dropdb rms_test_restore
```

---

## 2. Manual Fallback Procedures

### If the system is down and you need to continue operations:

**Step 1: Locate your last Excel export.**
Check the shared drive/folder where exports are saved. The file is named `rms-full-export-YYYY-MM-DD.xlsx`.

**Step 2: Open the Rebate Records sheet.**
This sheet contains every active rebate record with all the information you need:
- Distributor code and name
- Contract number
- Plan code and name
- Item number and description
- Rebate price (deviated price)
- Start date, end date, status

**Step 3: Continue operations manually.**
- **Looking up a price?** Filter the Records sheet by distributor + item number.
- **Processing a claim?** Compare claim file prices against the Records sheet prices.
- **Adding a new record?** Add a row to the spreadsheet. When the system is restored, use the contract upload tool to import it.

**Step 4: Track changes.**
Keep a separate "Changes" sheet or highlight modified rows so they can be entered into the system once it's restored.

---

## 3. System Restoration Procedures

### 3.1 App Down, Database Intact

The most common scenario — the app process crashed or the server rebooted.

```bash
cd /path/to/Rebate-Program
npm run start          # Production mode
# or
npm run dev            # Development mode
```

If using Docker:
```bash
docker-compose up -d
```

### 3.2 Database Corrupted, Backup Available

```bash
# Stop the application
# Restore from the most recent backup
npm run db:restore backups/rms-backup-2026-03-16-143022.sql

# Restart the application
npm run start
```

For custom-format backups:
```bash
npm run db:restore backups/rms-backup-2026-03-16-143022.dump
```

### 3.3 Fresh Server, Backup Available

```bash
# 1. Clone the repository
git clone <repo-url>
cd Rebate-Program

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with correct DATABASE_URL

# 4. Set up database schema
npx prisma db push

# 5. Restore data from backup
npm run db:restore backups/rms-backup-YYYY-MM-DD.sql

# 6. Start the application
npm run build && npm run start
```

### 3.4 Complete Loss — No Database Backup

If no database backup exists, you can rebuild from the last Excel export:

```bash
# 1. Set up fresh database with schema
npx prisma db push

# 2. Run seed script for reference data (distributors, users, column mappings)
npm run db:seed

# 3. Re-import records from Excel export
#    Use the Create Contract wizard to upload contract files
#    Use the reconciliation pipeline to process claim files
```

**Important:** The Excel export contains all the data, but re-importing requires manual effort. This is why regular database backups are essential — they restore everything automatically.

---

## 4. Data Architecture for Resilience

The system is designed so that **all business data can be reconstructed from exports**:

| Data Type | Primary Location | Backup Location | Can Rebuild From |
|-----------|-----------------|-----------------|------------------|
| Distributors | Database | Excel export, seed script | Seed script or manual entry |
| Contracts | Database | Excel export | Contract upload wizard |
| Rebate Plans | Database | Excel export | Created during contract setup |
| Items | Database | Excel export | Auto-created during import |
| Rebate Records | Database | Excel export + CSV | Contract upload or manual entry |
| End Users | Database | Excel export, seed script | Auto-created during import |
| Column Mappings | Database | Settings UI config | Re-configure in Settings |
| Audit Log | Database | Database backup only | Cannot reconstruct (acceptable) |
| Users | Database | Seed script | Re-create in Settings > Users |

---

## 5. Emergency Contacts & Access

Fill in your team's details:

| Role | Name | Contact | Access |
|------|------|---------|--------|
| System Admin | ____________ | ____________ | Server SSH, DB admin |
| Sales Ops Lead | ____________ | ____________ | RMS admin user |
| IT Support | ____________ | ____________ | Server hosting, DNS |
| Backup Location | ____________ | Path: ____________ | |

---

## 6. API Endpoints for Data Access

If the UI is down but the API is responding, you can still export data directly:

```bash
# Full Excel export (requires authentication cookie)
curl -b cookies.txt http://localhost:3000/api/export/full -o backup.xlsx

# Records CSV
curl -b cookies.txt http://localhost:3000/api/export/records-csv -o records.csv

# Individual API queries
curl -b cookies.txt http://localhost:3000/api/records
curl -b cookies.txt http://localhost:3000/api/distributors
```

---

## 7. Prevention Checklist

- [ ] Weekly Excel exports downloaded and saved to shared drive
- [ ] Daily database backups automated via cron
- [ ] Backup restoration tested at least once per quarter
- [ ] Shared drive accessible to at least 2 team members
- [ ] Emergency contacts filled in above
- [ ] At least 2 users have admin access to the system
- [ ] Server monitoring/alerting configured (uptime checks)
