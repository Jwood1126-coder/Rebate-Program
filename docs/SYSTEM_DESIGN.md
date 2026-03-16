# Rebate Management System - System Design Document

> **This document is the single source of truth for all system specifications**: data model, table definitions, API endpoints, screen designs, tech stack options, phased implementation plan, status values, validation rule catalog, and field mappings.
>
> For behavioral guidance — how to think, reason, build, review, and maintain this codebase — see `CLAUDE.md`. That file defines **how** to work; this file defines **what** the system is.
>
> **Implementation status key**: Items marked **[IMPLEMENTED]** are built and working in the current codebase. Items marked **[PLANNED]** are designed but not yet built. Items marked **[RESOLVED]** indicate stakeholder questions that have been answered.

---

## 1. Executive Summary

### What This System Should Be

The Rebate Management System (RMS) is a centralized, web-based internal application that serves as the single source of truth for all distributor rebate master data. It replaces the current process of maintaining separate spreadsheets per distributor with a unified database-backed system that provides filtered, distributor-specific views while storing all data in one normalized, auditable, and integration-ready structure.

> **Terminology note**: The original design used "customer" as the primary business entity. During implementation, this was clarified: the primary entity is the **distributor** (e.g., Fastenal, Motion Industries, HSC) — the party receiving the rebate. The **end user** (e.g., Link-Belt, CAT, Deere) is a separate entity representing the actual customer the distributor sells to. A contract ties a distributor to an end user.

### Why Centralize?

| Problem with Spreadsheets | Benefit of Centralization |
|---|---|
| Each distributor has a separate file | One system, one database, filtered views per distributor |
| No audit trail - who changed what, when? | Every change is logged with user, timestamp, before/after |
| Version confusion - which file is current? | Always one canonical version; versioning is built-in |
| Duplicate rows across sheets | Deduplication rules enforced at the database level |
| No validation - bad dates, missing fields | Business rules enforced on entry |
| Cannot integrate with CRM/ERP | API-ready from day one; structured data enables integration |
| No alerting for expirations | Dashboards and alerts for expiring/expired records |
| Difficult to search across distributors | Global and distributor-scoped search in seconds |

---

## 2. Business Goals

### Core Problems to Solve

1. **Eliminate spreadsheet fragmentation** - Replace N separate distributor spreadsheets with one centralized system that supports distributor-specific filtered views.

2. **Establish an audit trail** - Track every create, update, and delete operation with the user, timestamp, and before/after field values.

3. **Enforce data quality** - Prevent missing required fields, invalid date ranges, duplicate records, and overlapping effective periods through validation rules.

4. **Support effective-dated versioning** - Enable "replace, don't delete" workflows so historical records are preserved and future-dated changes can be staged.

5. **Enable search and reporting** - Allow users to find records by distributor, contract, item number, rebate plan, status, or date range in seconds.

6. **Prepare for integration** - Structure data so it can eventually sync with CRM (distributor/account master) and ERP (item/contract validation) systems.

7. **Reduce manual maintenance burden** - Provide bulk import/export, alerts for expiring records, and streamlined editing workflows.

8. **Support role-based access** - Allow read-only users (sales reps) and editors (rebate administrators) with appropriate permissions.

---

## 3. Functional Requirements

### 3.1 Central Rebate Record Storage **[IMPLEMENTED]**
- All rebate master data stored in a single relational database (PostgreSQL).
- Each record tied to a distributor (via plan -> contract -> distributor), end user (via contract), rebate plan, item, and effective date range.
- Records have a lifecycle: Draft -> Active -> Expired -> Superseded.

### 3.2 Distributor-Specific Views **[IMPLEMENTED]**
- Users can filter the entire dataset to see only records for a specific distributor.
- Distributor detail page shows all contracts, plans, and records for that distributor.
- **[PLANNED]** Supports "my distributors" bookmarking for quick access.

### 3.3 Search and Filtering **[IMPLEMENTED]**
- Global search across all distributors and records.
- Filter by: distributor, contract number, plan code, item number, status, date range.
- **[PLANNED]** Saved filter presets for common queries.

### 3.4 Add / Edit / Expire Records **[IMPLEMENTED]**
- Create new rebate records with all required fields.
- Edit existing records (with audit logging of every change).
- Expire records manually or automatically based on end date.
- **[PLANNED]** "Supersede" workflow: expire old record and create new version in one guided operation.

### 3.5 Effective-Dated Versioning **[IMPLEMENTED]**
- Every record has a `start_date` and `end_date`.
- System derives status from dates: Future (start > today), Active (start <= today <= end), Expired (end < today).
- When a rebate price changes, the old record is end-dated and a new record created with the new start date - preserving full history.
- Schema supports supersession chain via `superseded_by_id`.

### 3.6 Notes and Comments **[IMPLEMENTED]**
- Free-text notes on any rebate record via `record_notes` table.
- Timestamped and attributed to the user who wrote them.
- **[PLANNED]** Optional structured note types: "Price Change Reason", "Customer Request", "Internal Note".

### 3.7 Validation Rules **[IMPLEMENTED]**
- Required field enforcement (plan, item, rebate price, start date).
- Start date must be before or equal to end date.
- Rebate price must be a positive number.
- Duplicate detection: block same plan + item + start date.
- Overlap detection: prevent two active records for same plan + item with overlapping periods.
- Warning confirmation flow: warnings returned to client for explicit acknowledgment before proceeding.

### 3.8 Audit History **[IMPLEMENTED]**
- Immutable audit log for every record change.
- Captures: user, timestamp, action (INSERT/UPDATE/DELETE), field-level before/after values.
- Viewable as a global audit log page.
- Filterable by action type and table name.
- **[PLANNED]** Per-record audit history view (one click from any record).

### 3.9 Data Ingestion and Reconciliation
- **Claim Reconciliation** **[PLANNED — Design Complete]**: The system's primary claim validation workflow. Distributors submit monthly claim files listing items sold at deviated prices and the rebate amounts they believe they earned. Staff uploads these claim files; the system validates each claim line against stored contract terms (pricing, dates, covered items) and surfaces exceptions for human review. Optionally, NetSuite sales data can be uploaded to verify that claimed sales actually occurred. Approved contract updates flow through the existing validation and audit path. See `docs/RECONCILIATION_DESIGN.md` for the full design.
- **Claim File Spec**: Per-distributor column mappings for claim files. See `docs/CLAIM_FILE_SPEC.md`.
- **NetSuite Export Spec**: Expected field set for NetSuite saved search exports. See `docs/NETSUITE_SAVED_SEARCH_SPEC.md`.
- **Legacy Import** **[RETAINED]**: The `import_batches` table remains in the schema for potential one-off data migration use cases, but the standard operational path for external data is reconciliation.
- **Export** **[PLANNED]**: Export current view (filtered or full) to Excel/CSV. Include metadata columns (status, last modified, modified by).

### 3.10 Dashboards and Alerts **[PARTIALLY IMPLEMENTED]**
- Dashboard **[IMPLEMENTED]**: Active record count, records expiring in 30 days, distributor count, records modified in last 7 days, recent audit activity (last 10 entries), quick action links.
- **[PLANNED]** Full dashboard: sparkline trends, data quality alerts, records expiring in 30/60/90 days grouped by distributor.
- **[PLANNED]** Alerts: email or in-app notification for records expiring within a configurable window.

### 3.11 Role-Based Access Control **[IMPLEMENTED]**
- **Admin**: Full access including user management and system configuration.
- **Rebate Manager**: Create, edit, expire, import records. View audit logs.
- **Viewer**: Read-only access to records, dashboards, and exports. Cannot modify data.
- Auth enforced via middleware (session check on all pages) and API-level role checks (`getSessionUser()` + `canEdit()`) on write operations.
- **[PLANNED]** Distributor-level access restrictions (user can only see assigned distributors).

---

## 4. User Workflows

### 4.1 Reviewing a Distributor's Records

```
1. User navigates to Dashboard or Distributor List.
2. Selects distributor "FAS" (Fastenal) from the distributor list.
3. Distributor detail page loads showing:
   - Distributor summary (code, name)
   - Rebate records table with status, contract, plan, item, price, dates
4. User can filter by status: All, Active, Expired, Future.
5. User can search within the distributor's records.
```

**Implementation note**: The distributor detail page (`/distributors/[id]`) shows records in a table with status badges, search, and status filtering. Records are displayed with distributor, end user, contract, plan, item, price, dates, and derived status.

### 4.2 Updating a Rebate Price

```
1. User finds the record via distributor page or global records page.
2. Clicks "Edit" on the record row.
3. Modal opens with current values pre-filled.
4. User modifies the rebate price (and optionally dates).
5. System validates and returns warnings if applicable (e.g., retroactive date).
6. User confirms warnings if present.
7. Saves. Audit log captures old and new values automatically.
```

**Implementation note**: Editing is done via a modal dialog (`RecordModal`). The warning confirmation flow is implemented — if validation returns warnings and the client has not set `confirmWarnings: true`, the API returns `{ needsConfirmation: true, warnings: [...] }` for the UI to display.

### 4.3 Replacing an Expired Record with a New Version

```
1. User views expired records for a distributor (filter: Expired).
2. Selects the expired record.
3. [PLANNED] Clicks "Create New Version."
4. [PLANNED] System pre-fills all fields from the expired record.
5. User updates the rebate price, sets new start and end dates.
6. System validates: no overlap with other active records for same item/plan.
7. Saves. New record linked to the old one via a version chain.
```

### 4.4 Claim Reconciliation Workflow **[PLANNED — Design Complete]**

> **Note:** This workflow supersedes the original simple import pipeline concept. See `docs/RECONCILIATION_DESIGN.md` for the complete design.

The rebate process has two parts: (1) contract setup/maintenance (what the RMS currently manages), and (2) monthly claim reconciliation against those stored terms.

```
1. User navigates to Reconciliation hub (/reconciliation).
2. Starts a new reconciliation — selects distributor and claim period (month/year).
3. Uploads the distributor's monthly claim file.
   - System parses using per-distributor column mapping (docs/CLAIM_FILE_SPEC.md).
   - Claim lines are staged — NOT written to live records.
4. Optionally uploads a NetSuite saved search export for the same period.
   - System parses against the NetSuite spec (docs/NETSUITE_SAVED_SEARCH_SPEC.md).
   - Sales rows are staged.
5. User initiates the claim validation run.
   - System validates each claim line against stored contract terms.
   - Cross-references against NetSuite sales data if available.
   - Produces categorized exceptions (CLM-001 through CLM-014).
6. User reviews exceptions in the review queue.
   - Each exception shows claim data, contract terms, and (if available) sales data.
   - User approves, adjusts, rejects, or defers each exception.
7. User commits decisions.
   - Approved claim lines are confirmed for downstream rebate processing.
   - Contract updates (if needed) flow through existing validateRecord() → create/update → audit.
   - All changes are traceable back to the reconciliation run.
```

**Implementation note**: The current Import page (`/import`) shows a "Coming Soon" placeholder. It will be replaced by the Reconciliation hub (`/reconciliation`). The `import_batches` table exists in the schema and is retained for one-off migrations, but the standard data ingestion path is reconciliation with its own staging tables.

### 4.5 Reviewing Audit History **[IMPLEMENTED]**

```
1. From the global Audit Log page (/audit):
   a. Filter by action type (INSERT, UPDATE, DELETE) and table name.
   b. Each entry shows: timestamp, user, action, table, record ID, changed fields JSON.
   c. Paginated with 50 entries per page.
2. [PLANNED] From a specific record: click "History" tab to see all changes to that record.
3. [PLANNED] Click any audit entry to see full before/after snapshot in a readable diff view.
```

---

## 5. Ideal Data Model

### 5.1 Entity-Relationship Overview

```
distributors  1--M  contracts  1--M  rebate_plans  1--M  rebate_records
                       |                                       |
                  M--1 end_users                          M--1 items
                                                               |
                                                          1--M record_notes
                                                               |
                                                          1--M audit_log

import_batches  1--M  rebate_records (via import_batch_id)

users  1--M  audit_log
users  1--M  record_notes
users  1--M  rebate_records (created_by, updated_by)
```

> **Key terminology difference from original design**: What the original design called `customers` is implemented as `distributors`. The `end_users` table is a new entity not in the original design — it represents the actual end customer (e.g., Link-Belt, CAT, Deere) that a contract serves. A contract is scoped to a distributor + end user pair.

### 5.2 Table Definitions

#### `distributors` **[IMPLEMENTED]**
| Column | Type | Purpose |
|---|---|---|
| id | INT (PK, surrogate) | Internal identifier |
| code | VARCHAR(50) UNIQUE | Business key - distributor code (e.g., FAS, HSC, MOTION) |
| name | VARCHAR(255) NOT NULL | Display name (e.g., Fastenal, Motion Industries) |
| external_crm_id | VARCHAR(100) NULL | Future: linked CRM account ID |
| is_active | BOOLEAN DEFAULT TRUE | Soft-delete / deactivation flag |
| created_at | TIMESTAMP | Record creation time |
| updated_at | TIMESTAMP | Last modification time |

**Purpose**: Master list of distributors. One row per distributor account. These are the entities that receive rebates. Business key is `code` (e.g., FAS for Fastenal). Surrogate key `id` used for all foreign key references internally.

> **Naming note**: The original design called this table `customers` with fields `customer_code` and `customer_name`. The implementation uses `distributors` with `code` and `name` because the business clarified that the "customer" in the spreadsheet's "Rebate ID" column is actually the distributor, not the end customer.

---

#### `end_users` **[IMPLEMENTED]**
| Column | Type | Purpose |
|---|---|---|
| id | INT (PK, surrogate) | Internal identifier |
| code | VARCHAR(50) UNIQUE | Business key - end user code |
| name | VARCHAR(255) NOT NULL | Display name (e.g., Link-Belt, CAT, Deere) |
| external_crm_id | VARCHAR(100) NULL | Future: linked CRM account ID |
| is_active | BOOLEAN DEFAULT TRUE | Soft-delete / deactivation flag |
| created_at | TIMESTAMP | Record creation time |
| updated_at | TIMESTAMP | Last modification time |

**Purpose**: Master list of end users — the actual customers that distributors sell to. The rebate exists because a distributor sells to a specific end user. One contract per distributor + end user combination. This entity was not in the original design; it was added during implementation when the business relationship was clarified.

---

#### `contracts` **[IMPLEMENTED]**
| Column | Type | Purpose |
|---|---|---|
| id | INT (PK, surrogate) | Internal identifier |
| distributor_id | INT (FK -> distributors.id) | Owning distributor |
| end_user_id | INT (FK -> end_users.id) | The end user this contract serves |
| contract_number | VARCHAR(100) NOT NULL | Business key - the contract number from the spreadsheet |
| description | VARCHAR(500) NULL | Optional contract description |
| start_date | DATE NULL | Contract-level effective start |
| end_date | DATE NULL | Contract-level effective end |
| status | VARCHAR(20) DEFAULT 'active' | active, expired, cancelled |
| external_erp_id | VARCHAR(100) NULL | Future: linked ERP contract ID |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Purpose**: Represents a contract or agreement between a distributor and an end user. One contract belongs to one distributor and one end user, but may contain many rebate plans. Business key is `contract_number` scoped to a distributor + end user.

**Unique constraint**: `(distributor_id, end_user_id, contract_number)`

> **Design difference from original**: The original design scoped contracts to a customer only: `(customer_id, contract_number)`. The implementation adds `end_user_id` as part of the unique constraint, reflecting the clarified business rule that one contract exists per distributor + end user combination.

---

#### `rebate_plans` **[IMPLEMENTED]**
| Column | Type | Purpose |
|---|---|---|
| id | INT (PK, surrogate) | Internal identifier |
| contract_id | INT (FK -> contracts.id) | Parent contract |
| plan_code | VARCHAR(100) NOT NULL | Business key - the Plan ID from the spreadsheet (e.g., OSW, HYD, BRG) |
| plan_name | VARCHAR(255) NULL | Descriptive name for the plan |
| discount_type | VARCHAR(20) NOT NULL | 'part' or 'product_code' - determines whether discounts apply to individual parts or product code groups |
| status | VARCHAR(20) DEFAULT 'active' | active, expired, cancelled |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Purpose**: Represents a rebate plan or program within a contract. This is where the Plan ID lives. The `plan_code` field maps to the "Plan ID" column in spreadsheets (e.g., "OSW" for a specific rebate program).

**Unique constraint**: `(contract_id, plan_code)`

> **Resolved stakeholder question**: The Rebate ID in the spreadsheet is the distributor code (e.g., "FAS" = Fastenal). The Plan ID is the program code (e.g., "OSW", "HYD", "BRG"). They are distinct concepts at different levels of the hierarchy. The original design's `rebate_id_external` field on this table has been removed — the Rebate ID maps to `distributors.code` instead.

> **Design difference from original**: The original had both `plan_id_external` and `rebate_id_external` fields, pending stakeholder clarification. The implementation replaces `plan_id_external` with `plan_code` and drops `rebate_id_external`. It also adds `discount_type` to distinguish part-level vs product-code-level discounts. The original's `plan_type` (flat, tiered, percentage) has been replaced by this more specific field.

---

#### `items` **[IMPLEMENTED]**
| Column | Type | Purpose |
|---|---|---|
| id | INT (PK, surrogate) | Internal identifier |
| item_number | VARCHAR(100) UNIQUE NOT NULL | Business key - the item/SKU/part number (e.g., 0304-C-04) |
| item_description | VARCHAR(500) NULL | Human-readable item name |
| product_code | VARCHAR(100) NULL | Category grouping for product-code-level discounts |
| external_erp_id | VARCHAR(100) NULL | Future: linked ERP item master ID |
| is_active | BOOLEAN DEFAULT TRUE | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Purpose**: Master list of items/products/SKUs. Shared across all distributors. An item can appear in many rebate records for different distributors. Business key is `item_number`.

> **Design difference from original**: Added `product_code` field to support the `discount_type` distinction on rebate plans — when a plan's discount type is 'product_code', the rebate applies to all items sharing that product code.

---

#### `rebate_records` **[IMPLEMENTED]**
| Column | Type | Purpose |
|---|---|---|
| id | INT (PK, surrogate) | Internal identifier |
| rebate_plan_id | INT (FK -> rebate_plans.id) | Parent plan |
| item_id | INT (FK -> items.id) | The item this rebate applies to |
| rebate_price | DECIMAL(12,4) NOT NULL | The rebate price — a per-unit dollar amount |
| start_date | DATE NOT NULL | Effective start date |
| end_date | DATE NULL | Effective end date (NULL = open-ended) |
| status | VARCHAR(20) NOT NULL DEFAULT 'active' | Derived or manual: active, expired, future, superseded, draft, cancelled |
| superseded_by_id | INT (FK -> rebate_records.id) NULL UNIQUE | Link to the replacement record |
| import_batch_id | INT (FK -> import_batches.id) NULL | If created via import, which batch |
| created_by_id | INT (FK -> users.id) | User who created |
| updated_by_id | INT (FK -> users.id) | User who last modified |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Purpose**: The core table. Each row represents one rebate pricing rule: "For this plan + item, this rebate price applies during this date range." This is the direct equivalent of one row in the current spreadsheets.

**Business key**: `(rebate_plan_id, item_id, start_date)` — one price per plan+item per start date. Enforced as a unique constraint.

**Versioning**: When a price changes, the old record gets `status = 'superseded'` and `superseded_by_id` points to the new record. The new record's existence is linked back via the Prisma `SupersessionChain` relation.

**Status derivation logic** (implemented in `deriveRecordStatus()`):
```
IF status = 'cancelled'                -> 'cancelled'  (manual, not overridden)
IF status = 'draft'                    -> 'draft'      (manual, not overridden)
IF superseded_by_id IS NOT NULL        -> 'superseded'
ELSE IF end_date IS NOT NULL
        AND end_date < CURRENT_DATE    -> 'expired'
ELSE IF start_date > CURRENT_DATE      -> 'future'
ELSE                                   -> 'active'
```

> **Resolved stakeholder questions**: Rebate Price is a fixed per-unit dollar amount (e.g., $0.30/unit). The unique business key is (plan + item + start_date). The `rebate_price_type` field from the original design has been removed — all prices are per-unit fixed amounts.

> **Design difference from original**: Removed `rebate_price_type` (no longer needed). Removed `supersedes_id` (the reverse direction is handled by Prisma's relation, keeping only `superseded_by_id`). Field names use `created_by_id` / `updated_by_id` (Prisma convention) instead of `created_by` / `updated_by`.

---

#### `record_notes` **[IMPLEMENTED]**
| Column | Type | Purpose |
|---|---|---|
| id | INT (PK) | |
| rebate_record_id | INT (FK -> rebate_records.id) | The record this note belongs to |
| note_type | VARCHAR(50) DEFAULT 'general' | general, price_change_reason, customer_request, internal |
| note_text | TEXT NOT NULL | The note content |
| created_by_id | INT (FK -> users.id) | |
| created_at | TIMESTAMP | |

**Purpose**: Timestamped, attributed notes on rebate records. Replaces the single "Comment / Notes" column in the spreadsheet with a proper note history.

---

#### `audit_log` **[IMPLEMENTED]**
| Column | Type | Purpose |
|---|---|---|
| id | BIGINT (PK) | |
| table_name | VARCHAR(100) NOT NULL | Which table was changed |
| record_id | INT NOT NULL | PK of the changed record |
| action | VARCHAR(20) NOT NULL | INSERT, UPDATE, DELETE |
| changed_fields | JSONB NOT NULL | `{"field": {"old": X, "new": Y}, ...}` |
| user_id | INT (FK -> users.id) | Who made the change |
| ip_address | VARCHAR(45) NULL | Optional |
| created_at | TIMESTAMP NOT NULL | When the change happened |

**Purpose**: Immutable, append-only log of every data change. The `changed_fields` column stores a JSON diff so each audit row is self-contained. This table should never be updated or deleted from in normal operation.

**Implementation note**: Audit logging is wired via `auditService.logCreate()`, `auditService.logUpdate()`, and `auditService.logDelete()` — called explicitly in API route handlers after each write operation.

---

#### `import_batches` **[IMPLEMENTED — schema only, LEGACY]**
| Column | Type | Purpose |
|---|---|---|
| id | INT (PK) | |
| file_name | VARCHAR(500) NOT NULL | Original uploaded file name |
| file_hash | VARCHAR(128) NULL | SHA-256 of uploaded file for dedup |
| distributor_id | INT NULL | If the import was distributor-specific |
| total_rows | INT DEFAULT 0 | Total rows in the file |
| imported_count | INT DEFAULT 0 | Successfully imported |
| skipped_count | INT DEFAULT 0 | Skipped (duplicates, etc.) |
| error_count | INT DEFAULT 0 | Failed validation |
| status | VARCHAR(20) DEFAULT 'pending' | pending, processing, completed, failed |
| imported_by_id | INT (FK -> users.id) | |
| created_at | TIMESTAMP | |
| completed_at | TIMESTAMP NULL | |

**Purpose**: Tracks spreadsheet import operations for one-off data migration. Retained in the schema for legacy/migration use. **The primary data ingestion path is now the reconciliation workflow**, which uses its own staging tables (see `docs/RECONCILIATION_DESIGN.md` Section 8). New records should flow through reconciliation, not through direct import batches.

> **Design difference from original**: Uses `distributor_id` instead of `customer_id`. Uses `imported_by_id` instead of `imported_by`.

---

#### `users` **[IMPLEMENTED]**
| Column | Type | Purpose |
|---|---|---|
| id | INT (PK) | |
| username | VARCHAR(100) UNIQUE NOT NULL | Login identifier |
| display_name | VARCHAR(255) NOT NULL | |
| email | VARCHAR(255) NOT NULL | |
| password_hash | VARCHAR(255) NOT NULL | bcrypt-hashed password |
| role | VARCHAR(50) NOT NULL | admin, rebate_manager, viewer |
| is_active | BOOLEAN DEFAULT TRUE | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Purpose**: System users. Auth via NextAuth.js v5 (Credentials provider, JWT sessions). Seed users: admin/admin123, jwood/manager123, viewer/viewer123.

> **Design difference from original**: Added `password_hash` field for local authentication. The original design anticipated external auth (AD/SSO) and did not include a password field. Local-only deployment was confirmed as the initial requirement.

---

### 5.3 Business Keys vs Surrogate Keys

| Table | Business Key | Surrogate Key |
|---|---|---|
| distributors | code | id |
| end_users | code | id |
| contracts | (distributor_id, end_user_id, contract_number) | id |
| rebate_plans | (contract_id, plan_code) | id |
| items | item_number | id |
| rebate_records | (rebate_plan_id, item_id, start_date) | id |

**Design principle**: All foreign key relationships use surrogate `id` columns for stability and performance. Business keys are enforced via unique constraints and used for display, search, and import matching.

---

## 6. Validation and Business Rules

### 6.1 Required Fields **[IMPLEMENTED]**

| Field | Rule |
|---|---|
| Distributor | Every record must be linked to a distributor (via plan -> contract -> distributor) |
| Contract Number | Must exist and be non-empty |
| Item Number | Must exist in items table or be created during import |
| Rebate Plan | Must be selected (rebatePlanId required) |
| Rebate Price | Must be a positive number (> 0) |
| Start Date | Required on every rebate record |
| End Date | Recommended but nullable (NULL = open-ended) |

### 6.2 Date Logic **[IMPLEMENTED]**

- `start_date <= end_date` (when end_date is not null).
- Warning if `start_date` is in the past when creating a new record (retroactive date).
- Warning if `end_date` is more than 5 years in the future.
- Warning if `end_date` is null (open-ended record).

### 6.3 Duplicate Detection **[IMPLEMENTED]**

A **duplicate** is defined as two records with the same:
- `rebate_plan_id` + `item_id` + `start_date`

On create or update, the system blocks exact duplicates (error, not warning). The check excludes the current record when validating updates (`context.existingRecordId`).

### 6.4 Overlapping Effective Dates **[IMPLEMENTED]**

For the same `rebate_plan_id` + `item_id`, two active/future records should not have overlapping date ranges. The system:
- Detects overlaps on save and blocks with a clear error message.
- Excludes records with `status` in the overlap-excluded set (superseded, cancelled, draft) from overlap checks.

### 6.5 Expired / Future Record Handling **[IMPLEMENTED]**

- **Expired records** are never deleted. They remain visible with derived `status = 'expired'` and can be filtered in views.
- **Future records** (start_date > today) are shown with a "Future" status badge. They become active automatically when the date arrives (status is derived on read).
- Status derivation happens on-read via `deriveRecordStatus()`. Dashboard queries use date-based WHERE clauses instead of trusting stored status.

### 6.6 Notes / Comments Standardization **[IMPLEMENTED]**

- Notes are stored in `record_notes` with `note_text` as the standard field name.
- Notes are always timestamped and attributed to a user.
- Note types supported: 'general' (default), 'price_change_reason', 'customer_request', 'internal'.

### 6.7 Status Derivation **[IMPLEMENTED]**

Status is **computed** from dates and supersession, not manually maintained. Manual statuses (`draft`, `cancelled`) take precedence and are never overridden by derivation:

```
IF status = 'cancelled'                -> 'cancelled'  (manual, not overridden)
IF status = 'draft'                    -> 'draft'      (manual, not overridden)
IF superseded_by_id IS NOT NULL        -> 'superseded'
ELSE IF end_date IS NOT NULL
        AND end_date < CURRENT_DATE    -> 'expired'
ELSE IF start_date > CURRENT_DATE      -> 'future'
ELSE                                   -> 'active'
```

**Implementation**: `deriveRecordStatus()` in `src/lib/utils/dates.ts`. Called during record creation (to set initial status) and during updates (to re-derive when dates change). Dashboard and list queries use date-based WHERE clauses for accurate counts.

### 6.8 Stakeholder Questions — Resolution Status

| # | Question | Status | Resolution |
|---|---|---|---|
| 1 | **What is the exact difference between Rebate ID and Plan ID?** | **[RESOLVED]** | Rebate ID = distributor code (e.g., FAS, MOTION). Plan ID = program code (e.g., OSW, HYD, BRG). They are at different hierarchy levels. |
| 2 | **What does Rebate Price mean exactly?** | **[RESOLVED]** | Fixed per-unit dollar amount (e.g., $0.30/unit). No tiers, percentages, or volume brackets. |
| 3 | **What uniquely identifies a rebate record?** | **[RESOLVED]** | (rebate_plan_id, item_id, start_date). Enforced as unique constraint. |
| 4 | **Can one item have different rebate prices under the same plan for the same date range?** | **[RESOLVED]** | No. One price per plan+item+date range. Overlapping dates are blocked by validation. |
| 5 | **Who are the users?** | **[RESOLVED]** | Small team at Brennan Industries. Local-only deployment, no internet required. Three roles: admin, rebate_manager, viewer. |
| 6 | **Are there approval workflows?** | Deferred to Phase 2 | Draft status exists but no formal approval pipeline yet. |
| 7 | **What CRM and ERP systems are in use?** | Pending | External ID columns reserved but no integration targets confirmed. |
| 8 | **Is the rebate price always the same currency?** | **[RESOLVED]** | Yes, all USD. No multi-currency support needed. |

---

## 7. CRM and ERP Integration Design

### 7.1 Data Ownership Boundaries

| Data | Owner | Direction |
|---|---|---|
| Distributor name, account number | CRM | CRM -> RMS (sync) |
| End user name, account number | CRM | CRM -> RMS (sync) |
| Item number, item description | ERP | ERP -> RMS (sync or validate) |
| Contract number, contract dates | ERP or CRM | External -> RMS (sync or validate) |
| Rebate plans, rebate records, pricing | **RMS** (this system) | RMS is the master |
| Audit history, notes | **RMS** | RMS is the master |

### 7.2 Integration Patterns

#### Pattern 1: Distributor/End User Sync from CRM
- **Direction**: CRM -> RMS
- **Mechanism**: Scheduled batch sync (nightly) or webhook-triggered.
- **What syncs**: distributor code, name, external_crm_id, active status. Same for end users.
- **Phase**: v2 or v3. In v1, distributors and end users are created manually or via import. **[CURRENT STATE]**

#### Pattern 2: Item Validation from ERP
- **Direction**: ERP -> RMS (read-only lookup)
- **Mechanism**: On-demand API call when creating a rebate record. User enters item number, system validates against ERP item master.
- **Fallback**: If ERP is unavailable, allow manual entry with a "pending validation" flag.
- **Phase**: v3. **[PLANNED]**

#### Pattern 3: Contract Validation from ERP
- **Direction**: ERP -> RMS (read-only lookup)
- **Mechanism**: Similar to item validation. Verify contract number exists and is active.
- **Phase**: v3. **[PLANNED]**

#### Pattern 4: RMS Exposes API for Downstream
- **Direction**: RMS -> any consuming system
- **Mechanism**: REST API with authentication.
- **Use cases**: ERP pricing module queries RMS for current rebate prices. Reporting/BI tool pulls rebate data.
- **Phase**: v2 (read API), v3 (write API). **[PLANNED]**

#### Pattern 5: Activity Linking to CRM
- **Direction**: RMS -> CRM
- **Mechanism**: When a rebate record is created/changed, optionally create an activity/note on the CRM account.
- **Phase**: v3. **[PLANNED]**

### 7.3 Phase Summary

| Capability | v1 | v2 | v3 |
|---|---|---|---|
| Manual distributor/end user/item entry | Yes **[IMPLEMENTED]** | Yes | Yes |
| Reconciliation: claim file staging + parsing | Planned (Phase R1) | Yes | Yes |
| Reconciliation: claim validation engine + review | No | Planned (Phase R2) | Yes |
| Reconciliation: NetSuite three-way comparison | No | No | Planned (Phase R3) |
| Read-only REST API | No | Yes | Yes |
| Distributor sync from CRM | No | No | Yes |
| Item/contract validation from ERP | No | No | Yes |
| Write-back to CRM activities | No | No | Yes |

---

## 8. Reporting and Analytics

### 8.1 Operational Dashboards

#### Main Dashboard **[PARTIALLY IMPLEMENTED]**
- **Record counts** **[IMPLEMENTED]**: Active records, expiring within 30 days, distributor count, modified in last 7 days.
- **Recent activity** **[IMPLEMENTED]**: Last 10 audit log entries with user attribution.
- **Quick action links** **[IMPLEMENTED]**: Navigate to Distributors, Records, Import, Audit Log.
- **[PLANNED]** Sparkline trends, expiring records grouped by distributor (30/60/90 day windows).
- **[PLANNED]** Data quality alerts: records with missing end dates, overlapping date ranges, stale records.

#### Distributor Dashboard **[PLANNED]**
- All of the above, scoped to a single distributor.
- Contract summary: number of active plans and records per contract.

### 8.2 Standard Reports **[PLANNED]**

| Report | Description | Filters |
|---|---|---|
| Active Records by Distributor | All currently active rebate records, grouped by distributor | Distributor, contract, date range |
| Expiring Soon | Records with end_date within N days | Days threshold, distributor |
| Recently Changed | Records modified in the last N days | Date range, user, distributor |
| Duplicate/Overlap Exceptions | Records flagged for potential duplicates or date overlaps | Distributor, resolution status |
| Item-Level Lookup | All rebate records for a specific item across all distributors | Item number |
| Contract Summary | Aggregate view: records per contract, min/max prices, date ranges | Distributor, contract status |
| Reconciliation History | Reconciliation runs with match/exception/resolution counts | Date range, user, distributor |
| Audit Trail Report | Filterable audit log export | User, date range, action type, distributor |
| User Activity | Records created/modified per user over time | Date range, user |

### 8.3 Export **[PLANNED]**

All reports should be exportable to Excel (.xlsx) and CSV.

---

## 9. UX / Screen Design Recommendations

### Design Principles
- **Functional over flashy**: This is an internal LOB app. Prioritize clarity, speed, and data density over visual flair.
- **Spreadsheet-familiar**: Users are coming from Excel. The record table should feel like a smart spreadsheet with filtering, sorting, and inline indicators.
- **Minimal clicks**: Common operations (search, filter, edit) should take 1-2 clicks maximum.
- **Consistent layout**: Sidebar navigation, main content area, contextual action buttons.

### Implemented Tech Stack
- **Framework**: Next.js 16 (App Router) + TypeScript 5.9
- **Styling**: Tailwind CSS v4 with custom Brennan theme (Primary Blue #006293)
- **ORM**: Prisma 6.19
- **Database**: PostgreSQL 15 (Docker Compose)
- **Auth**: NextAuth.js v5-beta (Credentials provider, JWT sessions)
- **Testing**: Vitest 4.1

### 9.1 Screen Inventory

#### Dashboard (Home) — Route: `/` **[IMPLEMENTED]**
```
+----------------------------------------------------------+
| [BI Logo] Brennan Industries     [Header Bar]  [User]    |
|          Rebate Management                                |
+----------+-----------------------------------------------+
| NAV      | DASHBOARD                                     |
| ------   |                                               |
| Dashboard| +----------+ +----------+ +----------+ +----+ |
| Distribu-| | Active   | | Expiring | | Distrib- | |Mod-| |
|  tors    | | 1,247    | | 43 (30d) | | utors: 6 | |28  | |
| Rebate   | +----------+ +----------+ +----------+ +----+ |
|  Records |                                               |
| Recon-   | [Recent Activity - last 10 audit entries]     |
| ciliation|                                               |
| Audit Log|                                               |
|          | [Quick Actions - links to key pages]           |
|          |                                               |
+----------+-----------------------------------------------+
```

**Implementation notes**: Four summary cards (active records, expiring in 30 days, distributors, modified in 7 days). Recent activity shows last 10 audit log entries with action badges (INSERT/UPDATE/DELETE color-coded). Quick actions link to Distributors, Records, Reconciliation, and Audit Log pages. **Current state:** Sidebar still shows "Import" which will be renamed to "Reconciliation" when the reconciliation hub is built.

#### Distributor List — Route: `/distributors` **[IMPLEMENTED]**
- Table of all active distributors.
- Columns: Code, Name, and navigation to detail page.
- Click a row to open Distributor Detail.

#### Distributor Detail Page — Route: `/distributors/[id]` **[IMPLEMENTED]**
```
+----------------------------------------------------------+
| < Back to Distributors                                    |
| FAS - FASTENAL                                            |
+----------------------------------------------------------+
| [Search...] [Status filter: All/Active/Expired/Future]   |
| [+ New Record]                                            |
+----------------------------------------------------------+
| Contract# | End User  | Plan  | Item#   | Price  | Start | End   | Status |
| 101700    | LINK-BELT | OSW   | 0304-C  | $0.30  | 11/23 | 12/26 | Active |
| 101700    | LINK-BELT | OSW   | 0305-A  | $0.25  | 11/23 | 12/26 | Active |
| ...                                                       |
+----------------------------------------------------------+
```

**Implementation notes**: Shows all rebate records for the distributor with search and status filtering. Table includes end user, contract, plan code, item, price, dates, and derived status with color-coded badges. "New Record" button opens a modal for creating records scoped to this distributor.

#### Record Editor (Modal) **[IMPLEMENTED]**
```
+------------------------------------------+
| New / Edit Rebate Record     [X Close]   |
+------------------------------------------+
| Plan:        [Select plan dropdown  v]   |
| Item:        [Select item dropdown  v]   |
| Rebate Price: [$0.30               ]     |
| Start Date:   [2023-11-01          ]     |
| End Date:     [2026-12-31          ]     |
| Status:     Active (derived, read-only)  |
+------------------------------------------+
| [Save]  [Cancel]                         |
+------------------------------------------+
```

**Implementation notes**: Modal dialog for create and edit. Plan dropdown shows plans with distributor and end user context. Warning confirmation step if validation returns warnings. Status is derived and displayed read-only.

#### Rebate Records (Global View) — Route: `/records` **[IMPLEMENTED]**
- Same table structure as distributor detail, but shows records across all distributors.
- Additional "Distributor" column visible.
- Filter by distributor, status. Search across item, plan, contract.
- Paginated (50 per page).
- "New Record" button available.

#### Reconciliation Hub — Route: `/reconciliation` **[PLANNED]**
```
+----------------------------------------------------------+
| RECONCILIATION                                            |
+----------------------------------------------------------+
| [+ New Reconciliation]                                    |
+----------------------------------------------------------+
| Active Runs                                               |
| FAS - Fastenal     | Staged  | 3 exceptions | [Review]   |
| MOTION - Motion    | Review  | 12 exceptions| [Review]   |
+----------------------------------------------------------+
| Recent Completed                                          |
| HSC - 2026-03-01   | 45 matched | 2 resolved | Complete  |
| FAS - 2026-02-15   | 120 matched| 8 resolved | Complete  |
+----------------------------------------------------------+
```

**Implementation notes**: Replaces the old Import page (`/import`). The Reconciliation hub shows active runs, allows starting new reconciliation workflows, and provides history. The sidebar "Import" nav item will be replaced with "Reconciliation". See `docs/RECONCILIATION_DESIGN.md` for the full UI design including the wizard and review queue.

#### Import Page — Route: `/import` **[DEPRECATED — BEING REPLACED]**

The current Import page shows a "Coming Soon" placeholder. It will be replaced by the Reconciliation hub above. The old simple-import concept (Upload → Map → Validate → Confirm) has been superseded by the reconciliation workflow.

#### Audit Log Page — Route: `/audit` **[IMPLEMENTED]**
- Filterable table: Date, User, Action, Table, Record ID, Changed Fields (JSON).
- Filters: action type (INSERT/UPDATE/DELETE), table name.
- Paginated (50 per page).
- **[PLANNED]** Click a row to expand and see full before/after JSON diff in a readable format.

#### Reports Page **[PLANNED]**
- Not yet implemented. No route exists.

#### Settings Page **[REMOVED FROM SCOPE]**
- Originally planned in navigation. Removed during implementation — not needed for Phase 1.

---

## 10. Recommended Technical Architecture

### 10.1 Architecture Diagram

```
                    +-----------+
                    |  Browser  |
                    | (Next.js  |
                    |  SSR/RSC) |
                    +-----+-----+
                          |
                     HTTPS/REST
                          |
                  +-------+-------+
                  | Next.js App   |
                  | Router + API  |
                  | Routes        |
                  +-------+-------+
                          |
              +-----------+-----------+
              |                       |
      +-------+-------+     +--------+--------+
      | Validation &   |     | [PLANNED]       |
      | Audit Services |     | Background Jobs |
      | (Business Logic|     | (Import, Alerts)|
      +-------+-------+     +--------+--------+
              |                       |
         +----+----+                  |
         | Prisma  |<-----------------+
         | + PgSQL |
         +---------+
```

### 10.2 Implemented Tech Stack **[IMPLEMENTED]**

The system uses **Option C: Node.js Full-Stack** from the original design options.

| Layer | Technology | Status |
|---|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript 5.9 + Tailwind CSS v4 | **[IMPLEMENTED]** |
| API | Next.js API routes (App Router) | **[IMPLEMENTED]** |
| Database | PostgreSQL 15 via Prisma 6.19 ORM | **[IMPLEMENTED]** |
| Auth | NextAuth.js v5-beta (Credentials provider, JWT) | **[IMPLEMENTED]** |
| Background jobs | BullMQ + Redis | **[PLANNED]** — Redis in Docker Compose, no jobs yet |
| Testing | Vitest 4.1 (41 unit tests) | **[IMPLEMENTED]** |
| Deployment | Docker Compose (PostgreSQL + Redis) | **[IMPLEMENTED]** for dev |

### 10.3 Original Stack Options (for reference)

#### Option A: Python + React
| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React + TypeScript + Ant Design or MUI | Rich data tables, form components, familiar ecosystem |
| API | FastAPI (Python) or Django REST Framework | FastAPI: modern, fast, auto-docs. Django: batteries-included ORM + admin |
| Database | PostgreSQL | JSONB for audit, excellent date/range support, production-proven |
| Auth | Built-in session auth or JWT + LDAP/AD integration | |
| Background jobs | Celery + Redis (or Django-Q) | Import processing, nightly status jobs, alert emails |

#### Option B: C# / .NET + React or Blazor
| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React or Blazor Server | Blazor keeps everything in C#; React if team knows JS |
| API | ASP.NET Core Web API | Strong typing, excellent ORM (EF Core), enterprise-friendly |
| Database | SQL Server or PostgreSQL | SQL Server if already in a Microsoft shop |
| Auth | ASP.NET Identity + Windows Auth / AD | Natural fit for internal Windows-based orgs |
| Background jobs | Hangfire or built-in hosted services | |

### 10.4 Cross-Cutting Concerns

| Concern | Approach | Status |
|---|---|---|
| Authentication | NextAuth.js v5 Credentials provider with JWT sessions. Local user/password. | **[IMPLEMENTED]** |
| Authorization | Role-based (admin, rebate_manager, viewer). Enforced at API layer via `getSessionUser()` + `canEdit()`. Middleware redirects unauthenticated users to `/login`. | **[IMPLEMENTED]** |
| Audit logging | Service-layer functions (`auditService.logCreate/logUpdate/logDelete`) called explicitly in API handlers. | **[IMPLEMENTED]** |
| Error handling | Structured error responses from API. Validation returns `{ errors, warnings }` with field/code/severity/message. | **[IMPLEMENTED]** |
| Import processing | Async job queue planned. Schema ready. | **[PLANNED]** |
| Backup | Standard database backup strategy. | **[PLANNED]** |
| Monitoring | Health check endpoint. Error logging. | **[PLANNED]** |

---

## 11. Phased Implementation Plan

### Phase 1: Core Rebate Master Maintenance (MVP)
**Status**: In active development. Most features implemented.

| Feature | Scope | Status |
|---|---|---|
| Database schema | All core tables (distributors, end_users, contracts, rebate_plans, rebate_records, items, users, audit_log, import_batches, record_notes) | **[IMPLEMENTED]** |
| Distributor list + detail | View all distributors, drill into distributor records | **[IMPLEMENTED]** |
| Rebate record CRUD | Create, read, update, soft-delete (cancel) records with full validation | **[IMPLEMENTED]** |
| Effective-dated versioning | Status derivation from dates. Supersession schema ready. | **[IMPLEMENTED]** |
| Search and filter | Filter by distributor, status. Search by item, plan, contract. | **[IMPLEMENTED]** |
| Basic audit log | Automatic logging of all changes, viewable on global audit page | **[IMPLEMENTED]** |
| Data ingestion | Staged reconciliation workflow (replaces original import concept). See `docs/RECONCILIATION_DESIGN.md`. | **[PLANNED — Design Complete]** — placeholder page exists |
| Export to Excel/CSV | Export current filtered view | **[PLANNED]** |
| Basic auth | Username/password login with roles (admin, rebate_manager, viewer) | **[IMPLEMENTED]** |
| Notes on records | Schema ready, API support via record_notes table | **[IMPLEMENTED]** |
| Dashboard | Summary metrics and recent activity | **[IMPLEMENTED]** |

**Rationale**: This replaces the spreadsheets entirely. Users can stop using Excel after this phase.

---

### Phase 2: Reconciliation and Operational Improvements
**Timeline target**: After Phase 1 core is stable

| Feature | Scope |
|---|---|
| **Reconciliation Phase R1** | Claim file staging: upload, parse with per-distributor column mapping, validate format, stage. See `docs/RECONCILIATION_DESIGN.md`. |
| **Reconciliation Phase R2** | Claim validation engine: claim lines ↔ contract terms, exception detection (CLM-001–CLM-009), review queue, approve/reject/commit. |
| Enhanced dashboard | Sparkline trends, expiring 30/60/90 day groups, data quality alerts, reconciliation status metrics |
| Alerts/notifications | Email or in-app alerts for records expiring within N days |
| Saved filters / bookmarks | Save and name frequently used filter combinations |
| Bulk operations | Select multiple records and bulk-update status, end-date, or re-assign |
| Enhanced audit log | Per-record history view, expandable diff display |
| Reports | All standard reports from Section 8 |
| Guided supersede workflow | Expire old record and create new version in one operation with pre-fill |

**Rationale**: Claim reconciliation is the next critical capability — it enables the monthly claim validation workflow (Part 2 of the rebate process). Dashboard and usability improvements leverage reconciliation results.

---

### Phase 3: Three-Way Reconciliation, Integration, and Analytics
**Timeline target**: After Phase 2, when NetSuite export format is confirmed

| Feature | Scope |
|---|---|
| **Reconciliation Phase R3** | NetSuite export staging + claim-vs-sales cross-reference. Sales verification exceptions (CLM-010–CLM-014). |
| **Reconciliation Phase R4** | Reconciliation analytics: trends, distributor health scores, monthly overdue alerts, exception carry-forward. |
| REST API (read) | External systems can query rebate data programmatically |
| REST API (write) | External systems can create/update rebate records via API |
| CRM distributor/end user sync | Auto-sync distributor and end user master data from CRM |
| ERP item/contract validation | Validate item numbers and contracts against ERP on entry |
| Advanced analytics | Trend analysis, price change frequency, distributor comparison |
| Automation rules | Auto-expire records on end date, auto-notify on approaching expiration |
| SSO / AD integration | Replace basic auth with corporate identity provider |
| CRM activity write-back | Log rebate changes as CRM account activities |

**Rationale**: Three-way reconciliation depends on confirmed NetSuite export format and business rules. Integration should only happen after the core system and reconciliation workflow are stable and adopted.

---

## 12. Risks and Design Pitfalls

### 12.1 Data Quality Risks

| Risk | Mitigation |
|---|---|
| **Claim file data is messy** - inconsistent column names across distributors, varying formats, missing values, duplicate rows | Per-distributor column mapping with format validation during staging. Claim validation catches discrepancies before they affect contract records. Budget time for onboarding each distributor's file format. See `docs/CLAIM_FILE_SPEC.md`. |
| **Historical data gaps** - old spreadsheets may lack dates, have wrong dates, or have no audit trail | Stage historical data through reconciliation with appropriate warnings. Don't try to reconstruct missing history. Use reconciliation run traceability to track provenance. |

### 12.2 Design Pitfalls

| Pitfall | Avoidance |
|---|---|
| **Building six separate mini-apps per distributor** | The entire design is one system with filtered views. Resist any temptation to distributor-silo the data. |
| **Over-engineering the pricing model** | Start with a simple `rebate_price` field (per-unit dollar amount). **[RESOLVED]** — confirmed as fixed per-unit. |
| **Skipping validation rules** | Data quality is the #1 value-add over spreadsheets. Invest in good validation from day one. **[IMPLEMENTED]** |
| **Audit logging as an afterthought** | Build audit into the data layer from the start. **[IMPLEMENTED]** |
| **Premature CRM/ERP integration** | Do not attempt integration in Phase 1. Get the core right first. **[CORRECT — no integration built]** |
| **Custom-building everything** | Use a component library for tables, forms, filters. **[Using Tailwind CSS with custom components]** |

### 12.3 Organizational Risks

| Risk | Mitigation |
|---|---|
| **User adoption resistance** | Involve key users in design and testing. Make sure the system is genuinely easier than spreadsheets. |
| **Scope creep** | Hold firm on Phase 1 scope. Capture all enhancement requests for Phase 2+. |
| **Single point of failure** | Ensure at least 2 people understand the system. Document architecture and deployment. |
| **No executive sponsor** | This project needs a business owner who will enforce adoption and resolve disputes. |

---

## 13. Recommended Stakeholder Discovery Questions

### Must-Ask (Blocks Design)

1. ~~**What is the difference between Rebate ID and Plan ID?**~~ **[RESOLVED]** Rebate ID = distributor code, Plan ID = program code.

2. ~~**What exactly does Rebate Price represent?**~~ **[RESOLVED]** Per-unit dollar amount.

3. ~~**What combination of fields uniquely identifies a rebate record?**~~ **[RESOLVED]** (plan_id, item_id, start_date).

4. **How many distributors are managed today?** Currently 6 known: FAS, MOTION, HSC, AIT, LGG, TIPCO. How many total rebate records exist across all spreadsheets (rough estimate)?

5. ~~**Who are the primary users?**~~ **[RESOLVED]** Small team at Brennan Industries. Three roles defined.

6. **Is there an approval workflow?** Can anyone change a rebate price, or does it need sign-off? **Deferred to Phase 2.**

7. **What CRM and ERP systems are in use?** What systems hold distributor accounts, item masters, and contracts? **Still pending.**

8. ~~**Is there a preferred technology stack?**~~ **[RESOLVED]** Next.js + TypeScript + Prisma + PostgreSQL.

### High-Value (Informs Priority)

9. **What is the most painful part of the current process?** What takes the most time or causes the most errors?

10. **How often do rebate prices change?** Daily? Weekly? Quarterly? At contract renewal?

11. **What happens when a record expires?** Does someone always create a new one? Or do some just end?

12. **Are there any downstream systems that consume rebate data?** Does anyone else pull from these spreadsheets?

13. ~~**Is there a currency dimension?**~~ **[RESOLVED]** All USD.

14. **How are the spreadsheets shared today?** Email? Shared drive? SharePoint? Who has access?

15. **What reports or summaries do you generate from the spreadsheets today?** (This reveals implicit requirements.)

16. **Are there any compliance or regulatory requirements** around rebate data retention or auditability?

---

## Appendix A: Entity-Relationship Diagram

```
┌─────────────┐                                ┌──────────────┐
│ distributors │                                │  end_users    │
├─────────────┤                                ├──────────────┤
│ id (PK)      │──┐                         ┌──│ id (PK)       │
│ code (UNIQUE)│  │                         │  │ code (UNIQUE) │
│ name         │  │                         │  │ name          │
│ external_crm │  │                         │  │ external_crm  │
│ is_active    │  │                         │  │ is_active     │
│ created_at   │  │                         │  │ created_at    │
│ updated_at   │  │                         │  │ updated_at    │
└─────────────┘  │   ┌──────────────┐      │  └──────────────┘
                  │   │  contracts    │      │
                  └──M│              │M─────┘
                      ├──────────────┤
                      │ id (PK)       │──1:M──┐
                      │ distributor_id │       │
                      │ end_user_id   │       │
                      │ contract_number│      │
                      │ description   │       │
                      │ start_date    │       │
                      │ end_date      │       │  ┌───────────────┐
                      │ status        │       │  │ rebate_plans   │
                      │ external_erp  │       │  ├───────────────┤
                      │ created_at    │       └──│ id (PK)        │
                      │ updated_at    │          │ contract_id    │
                      └──────────────┘          │ plan_code      │
                                                 │ plan_name      │
                                                 │ discount_type  │
                                                 │ status         │
                                                 │ created_at     │
                                                 │ updated_at     │
                                                 └───────┬───────┘
                                                         │
                                                         │ 1:M
┌─────────────┐                               ┌─────────┴───────┐
│   items      │                               │ rebate_records   │
├─────────────┤                               ├─────────────────┤
│ id (PK)      │──────────────────────────M:1──│ id (PK)          │
│ item_number  │                               │ rebate_plan_id   │
│ item_desc    │                               │ item_id          │
│ product_code │                               │ rebate_price     │
│ external_erp │                               │ start_date       │
│ is_active    │                               │ end_date         │
│ created_at   │                               │ status           │
│ updated_at   │                               │ superseded_by_id │──┐
└─────────────┘                               │ import_batch_id  │  │ (self-ref)
                                               │ created_by_id    │──┘
┌─────────────┐                               │ updated_by_id    │
│   users      │                               │ created_at       │
├─────────────┤                               │ updated_at       │
│ id (PK)      │──1:M──audit_log              └───────┬─────────┘
│ username     │──1:M──record_notes                    │
│ display_name │──1:M──rebate_records (created/updated)│
│ email        │                                  1:M  │  1:M
│ password_hash│                               ┌───────┴──┐  ┌────────────┐
│ role         │                               │record_notes│  │ audit_log   │
│ is_active    │                               ├───────────┤  ├────────────┤
└─────────────┘                               │ id (PK)    │  │ id (PK)     │
                                               │ record_id  │  │ table_name  │
┌────────────────┐                            │ note_type  │  │ record_id   │
│ import_batches  │                            │ note_text  │  │ action      │
├────────────────┤                            │ created_by │  │ changed_flds│
│ id (PK)         │──1:M──rebate_records      │ created_at │  │ user_id     │
│ file_name       │   (via import_batch_id)    └───────────┘  │ created_at  │
│ file_hash       │                                            └────────────┘
│ distributor_id  │
│ total_rows      │
│ imported_count  │
│ skipped_count   │
│ error_count     │
│ status          │
│ imported_by_id  │
│ created_at      │
│ completed_at    │
└────────────────┘
```

---

## Appendix B: API Structure

### REST API Endpoints — Implemented

```
Authentication [IMPLEMENTED]
  POST   /api/auth/[...nextauth]         # NextAuth.js handles login/logout/session
                                          # Credentials provider with JWT

Distributors [IMPLEMENTED]
  GET    /api/distributors                # List all active distributors
  POST   /api/distributors               # Create new distributor (requires auth + editor role)

Rebate Plans [IMPLEMENTED]
  GET    /api/plans                       # List active plans with contract/distributor/end user context

Items [IMPLEMENTED]
  GET    /api/items                       # List all items

Rebate Records [IMPLEMENTED]
  GET    /api/records                     # List (paginated, filterable by distributor/status/search)
  POST   /api/records                     # Create (validated, audited, requires auth + editor role)
  GET    /api/records/:id                 # Detail with plan/contract/distributor/end user/item/user includes
  PUT    /api/records/:id                 # Update (validated, audited, requires auth + editor role)
  DELETE /api/records/:id                 # Soft delete (sets status to cancelled, audited)

Audit Log [IMPLEMENTED]
  GET    /api/audit                       # Global audit log (paginated, filterable by action/table)
```

### REST API Endpoints — Planned

```
Distributors (expanded)
  GET    /api/distributors/:id            # Distributor detail
  PUT    /api/distributors/:id            # Update distributor
  GET    /api/distributors/:id/records    # All rebate records for distributor
  GET    /api/distributors/:id/contracts  # All contracts for distributor

End Users
  GET    /api/end-users                   # List
  GET    /api/end-users/:id               # Detail
  POST   /api/end-users                   # Create
  PUT    /api/end-users/:id               # Update

Contracts
  GET    /api/contracts                   # List
  GET    /api/contracts/:id               # Detail
  POST   /api/contracts                   # Create
  PUT    /api/contracts/:id               # Update
  GET    /api/contracts/:id/plans         # Plans under contract

Rebate Records (expanded)
  POST   /api/records/:id/supersede       # Supersede (expire old + create new)
  POST   /api/records/:id/expire          # Manually expire
  GET    /api/records/:id/audit           # Audit history for this record
  GET    /api/records/:id/notes           # Notes for this record
  POST   /api/records/:id/notes           # Add note

Reconciliation [PLANNED — see docs/RECONCILIATION_DESIGN.md]
  POST   /api/reconciliation                          # Create new reconciliation run
  GET    /api/reconciliation                          # List runs (paginated, filterable)
  GET    /api/reconciliation/:runId                   # Run detail with summary stats
  POST   /api/reconciliation/:runId/upload-claim       # Upload + stage distributor claim file
  POST   /api/reconciliation/:runId/upload-sales      # Upload + stage NetSuite export
  POST   /api/reconciliation/:runId/execute           # Run the claim validation engine
  GET    /api/reconciliation/:runId/issues            # List exceptions (filterable)
  PUT    /api/reconciliation/:runId/issues/:issueId   # Resolve an exception (accept/reject/defer)
  POST   /api/reconciliation/:runId/commit            # Commit approved changes

Legacy Import [RETAINED — for one-off migration use only]
  POST   /api/imports/upload              # Upload file, returns batch ID
  GET    /api/imports/:batchId/preview    # Preview with validation results
  POST   /api/imports/:batchId/confirm    # Commit the import
  GET    /api/imports/:batchId            # Import batch status/summary
  GET    /api/imports                     # Import history

Reports
  GET    /api/reports/expiring-soon       # Records expiring within N days
  GET    /api/reports/recently-changed    # Recently modified records
  GET    /api/reports/duplicates          # Potential duplicate/overlap issues
  GET    /api/reports/summary-by-distributor  # Aggregate stats per distributor

Export
  GET    /api/export/records              # Export filtered records as .xlsx or .csv
  GET    /api/export/report/:name         # Export a named report
```

### Common Query Parameters (Implemented)

```
?page=1&limit=50                           # Pagination [IMPLEMENTED]
?distributor=FAS                           # Filter by distributor code [IMPLEMENTED]
?status=active                             # Filter by derived status [IMPLEMENTED]
?search=widget                             # Search across item/plan/contract [IMPLEMENTED]
?action=INSERT                             # Audit log: filter by action [IMPLEMENTED]
?table=rebate_records                      # Audit log: filter by table [IMPLEMENTED]
```

### Common Query Parameters (Planned)

```
?sort=start_date&order=desc                # Sorting
?item_number=ITM-500                       # Filter by item
?start_date_from=2025-01-01                # Date range filter
?start_date_to=2025-12-31
?format=xlsx                               # Export format
```

---

## Appendix C: Reference — Status Values, Validation Rules, Audit Format, and Field Mapping

### Record Statuses **[IMPLEMENTED]**

| Status | Meaning | How Set |
|---|---|---|
| `draft` | Record created but not yet finalized | Manual (set via API, not overridden by derivation) |
| `active` | Currently in effect (start <= today <= end or no end) | Derived from dates |
| `future` | Not yet effective (start > today) | Derived from dates |
| `expired` | Past its end date (end < today) | Derived from dates |
| `superseded` | Replaced by a newer version | Set when superseded_by_id is populated |
| `cancelled` | Manually voided / soft deleted | Manual action (DELETE endpoint sets this) |

### Contract Statuses **[IMPLEMENTED]**

| Status | Meaning |
|---|---|
| `active` | Contract is current |
| `expired` | Contract past its end date |
| `cancelled` | Contract terminated early |

### Import Batch Statuses **[SCHEMA ONLY — Legacy]**

| Status | Meaning |
|---|---|
| `pending` | File uploaded, awaiting processing |
| `processing` | Import in progress |
| `completed` | Import finished successfully |
| `failed` | Import failed (system error) |

> **Note**: The `import_batches` table is retained for potential one-off migration use. The primary data ingestion path is now the reconciliation workflow, which uses its own staging tables and statuses. See `docs/RECONCILIATION_DESIGN.md` Section 8.

### Reconciliation Run Statuses **[PLANNED]**

| Status | Meaning |
|---|---|
| `draft` | Run created, awaiting file uploads |
| `staged` | Files uploaded and parsed into staging tables |
| `running` | Comparison engine executing |
| `review` | Exceptions generated, awaiting human review |
| `completed` | All exceptions resolved and approved changes committed |
| `cancelled` | Run cancelled before completion |

### Reconciliation Exception Codes **[PLANNED]**

See `docs/RECONCILIATION_DESIGN.md` Section 6 for full exception category definitions (CLM-001 through CLM-014), including claim-vs-contract, claim-vs-sales, and contract health exceptions.

### Validation Messages **[IMPLEMENTED]**

| Code | Severity | Message | Status |
|---|---|---|---|
| `VAL-001` | Error | "Rebate price is required and must be greater than zero." | **[IMPLEMENTED]** |
| `VAL-002` | Error | "Start date is required." | **[IMPLEMENTED]** |
| `VAL-003` | Error | "End date must be on or after start date." | **[IMPLEMENTED]** |
| `VAL-004` | Error | "Rebate plan is required." | **[IMPLEMENTED]** |
| `VAL-005` | Error | "Item number is required." | **[IMPLEMENTED]** |
| `VAL-006` | Error | "Duplicate record: a record with the same plan, item, and start date already exists (Record #{{id}})." | **[IMPLEMENTED]** |
| `VAL-007` | Error | "Overlapping dates: this record overlaps with Record #{{id}} for the same plan and item." | **[IMPLEMENTED]** |
| `VAL-008` | Warning | "Start date is in the past. This record will have a retroactive effective date." | **[IMPLEMENTED]** |
| `VAL-009` | Warning | "No end date specified. This record will remain active indefinitely." | **[IMPLEMENTED]** |
| `VAL-010` | Warning | "This item number does not exist in the system. It will be created automatically." | **[PLANNED]** — for claim reconciliation |
| `VAL-011` | Warning | "End date is more than 5 years in the future. Please verify this is correct." | **[IMPLEMENTED]** |
| `VAL-012` | Info | "This record supersedes Record #{{id}}, which will be marked as superseded." | **[PLANNED]** — for supersede workflow |
| `VAL-013` | Error | "Distributor is required. Each record must be associated with a distributor." | **[PLANNED]** — for claim reconciliation |
| `VAL-014` | Warning | "This contract has an expired status. Adding records to an expired contract may indicate a data issue." | **[IMPLEMENTED]** |

> **Code change note**: VAL-004 was "Contract number is required" in the original; implemented as "Rebate plan is required" since the API accepts `rebatePlanId` directly (the plan implies the contract and distributor). VAL-013 was "Customer is required"; updated to "Distributor is required".

### Rebate Plan Statuses **[IMPLEMENTED]**

| Status | Meaning |
|---|---|
| `active` | Plan is current and accepting records |
| `expired` | Plan past its effective period |
| `cancelled` | Plan terminated early |

### Audit Entry Format **[IMPLEMENTED]**

Every write operation on business tables generates an audit log entry with this structure:

```json
{
  "table_name": "rebate_records",
  "record_id": 1234,
  "action": "UPDATE",
  "changed_fields": {
    "rebate_price": { "old": "12.5000", "new": "14.7500" },
    "end_date": { "old": "2025-12-31", "new": "2026-06-30" }
  },
  "user_id": 5,
  "created_at": "2026-03-13T14:30:00Z"
}
```

**Action values:** `INSERT`, `UPDATE`, `DELETE`

**`changed_fields` conventions:**
- For `INSERT`: full snapshot of created fields (via `computeInsertSnapshot()`)
- For `UPDATE`: only changed fields, each with `old` and `new` values (via `computeFieldDiff()`)
- For `DELETE` (soft delete): captures the status change field
- Timestamps are always UTC in ISO 8601 format
- Decimal values stored as strings to preserve precision (`"12.5000"` not `12.5`)

**Attribution:** `user_id` is always populated. All writes require authentication via `getSessionUser()`.

**Implementation**: `auditService` in `src/lib/audit/audit.service.ts` with methods `logCreate()`, `logUpdate()`, `logDelete()`.

### Spreadsheet-to-System Field Mapping

This is the canonical mapping used by the import column mapper. When spreadsheet columns are auto-detected, this table defines the standard resolution.

| Spreadsheet Column | System Field | Target Table | Notes |
|---|---|---|---|
| Customer / Account / Rebate ID | `code` | `distributors` | Lookup existing distributor by code. The "Rebate ID" in spreadsheets is the distributor code (e.g., FAS). |
| End User / End Customer | `code` | `end_users` | Lookup existing or create |
| Contract # | `contract_number` | `contracts` | Scoped to distributor + end user |
| Plan ID / Program | `plan_code` | `rebate_plans` | Business key for the plan (e.g., OSW, HYD) |
| Item # / Item Number / SKU | `item_number` | `items` | Lookup existing or create (VAL-010 warning) |
| Product Code | `product_code` | `items` | Category grouping |
| Rebate Price / Price | `rebate_price` | `rebate_records` | Must be positive decimal, per-unit dollar amount |
| Start Date / Starting Date / Effective Date | `start_date` | `rebate_records` | Required |
| End Date / Expiration Date / Expiry Date | `end_date` | `rebate_records` | NULL if blank (VAL-009 warning) |
| Comment / Comments / Notes | `note_text` | `record_notes` | Imported as initial note with type `general` |

> **Mapping changes from original**: "Customer / Account" now maps to `distributors.code` instead of `customers.customer_code`. Added "End User" mapping. "Rebate ID" maps to `distributors.code` (not `rebate_plans.rebate_id_external`). "Plan ID" maps to `plan_code` instead of `plan_id_external`. Added "Product Code" mapping.

**Unmapped columns:** Any spreadsheet column not matching this table should be flagged during import for manual mapping or explicit skip. Never silently ignored.

---

## Appendix D: MVP vs Non-MVP Scope

### MVP (Phase 1) - Ship This First

| Category | In Scope | Status |
|---|---|---|
| **Data** | Distributors, end users, contracts, rebate plans, items, rebate records, notes | **[IMPLEMENTED]** |
| **CRUD** | Full create/read/update for rebate records. Create for distributors. | **[IMPLEMENTED]** |
| **Versioning** | Supersede schema ready, status derivation from dates | **[IMPLEMENTED]** |
| **Validation** | All error-level rules (VAL-001 through VAL-007), warning rules (VAL-008, VAL-009, VAL-011, VAL-014) | **[IMPLEMENTED]** |
| **Search** | Filter by distributor, status. Search by item, plan, contract. | **[IMPLEMENTED]** |
| **Reconciliation** | Monthly claim validation workflow: claim file upload with per-distributor mapping, validation against contract terms, exception review, approve/reject. Design complete — see `docs/RECONCILIATION_DESIGN.md`. | **[PLANNED — Design Complete]** |
| **Export** | Export current view to Excel/CSV | **[PLANNED]** |
| **Audit** | Automatic audit logging, global audit log page | **[IMPLEMENTED]** |
| **Auth** | Username/password, 3 roles (admin, rebate_manager, viewer) | **[IMPLEMENTED]** |
| **UI** | Distributor list, distributor detail, global records table, record editor modal, reconciliation placeholder (currently shows as Import), audit log page, dashboard | **[IMPLEMENTED]** |

### Non-MVP (Phase 2+) - Do Not Build Yet

| Category | Deferred To |
|---|---|
| Reconciliation: claim file staging + parsing | Phase 2 (R1) |
| Reconciliation: claim validation engine + review/commit | Phase 2 (R2) |
| Reconciliation: NetSuite sales verification | Phase 3 (R3) |
| Reconciliation: analytics, health scores, trends | Phase 3 (R4) |
| Enhanced dashboard with metrics and charts | Phase 2 |
| Email/in-app alerts for expiring records | Phase 2 |
| Saved filter presets | Phase 2 |
| Bulk operations (multi-select edit) | Phase 2 |
| Per-record audit history view | Phase 2 |
| Standard reports (all from Section 8) | Phase 2 |
| Guided supersede workflow | Phase 2 |
| REST API for external consumers | Phase 3 |
| CRM distributor/end user sync | Phase 3 |
| ERP item/contract validation | Phase 3 |
| SSO / Active Directory integration | Phase 3 |
| CRM activity write-back | Phase 3 |
| Advanced analytics and trend reporting | Phase 3 |
| Automation rules | Phase 3 |

### MVP Success Criteria

The MVP is successful when:
1. Users can stop using the distributor spreadsheets for day-to-day rebate record maintenance.
2. All existing spreadsheet data has been imported into the system.
3. Users can find, view, edit, and create rebate records faster than in Excel.
4. Every change is automatically audit-logged.
5. Data quality is enforced (no more missing fields, invalid dates, or undetected duplicates).
