# Reconciliation Design — Rebate Management System

> **This document defines the design for the claim reconciliation workflow** — the system's mechanism for validating monthly distributor rebate claims against stored contract terms and sales activity data. It supersedes the original "import pipeline" concept.
>
> For the system specification, see `SYSTEM_DESIGN.md`. For behavioral guidance, see `CLAUDE.md`. For the external file contracts, see `CLAIM_FILE_SPEC.md` and `NETSUITE_SAVED_SEARCH_SPEC.md`.

---

## 1. The Two-Part Rebate Process

The rebate business process has two connected workflows. This system serves both, but they are distinct:

### Part 1: Contract Setup and Maintenance

A distributor requests special pricing or rebate coverage for a group of part numbers tied to a specific end user or opportunity. Once Brennan approves the request, an internal contract record is created with:

- A unique **Contract ID** (Brennan-assigned, 6-digit numeric)
- The **distributor** account
- The **end user** (customer/company)
- The covered **part numbers**
- The approved **pricing terms** (deviated price per item)
- The **effective date range**

That contract becomes the official source of truth for what rebate terms were approved. This is not a claim — it is the setup and maintenance of approved terms that will later be used to validate claims.

**This is what the RMS currently manages** — the Records, Distributors, and Contracts pages are the contract setup and maintenance workflow.

### Part 2: Claim Reconciliation and Approval (Monthly)

After the distributor actually sells items at the deviated price, they submit a **monthly claim file** showing:

- What they sold (part number, quantity)
- When they sold it (transaction date)
- To whom (end user)
- Under which contract (Contract ID)
- The price they sold at (deviated price) and the standard price
- The rebate amount they believe they earned: `(Standard Price - Deviated Price) × Quantity`

Brennan's team then compares the submitted claim **line by line** against the approved contract data — checking pricing, dates, covered items, and contract validity. The purpose is to confirm whether the claim matches the contract, identify any variances or decline reasons, and then **approve, adjust, or reject** each claim line.

**This is what the reconciliation workflow builds.**

---

## 2. Purpose and Business Value

### Why Reconciliation?

Without a structured claim validation process, Brennan's team manually compares claim spreadsheets against contract records — a slow, error-prone process that becomes harder as the number of distributors, contracts, and line items grows.

The reconciliation workflow automates the comparison and surfaces exceptions for human decision.

### Business Value

| Value | Description |
|-------|-------------|
| **Validate claims against contracts** | Every claim line is checked against approved contract terms — price, item, date range, end user |
| **Catch pricing discrepancies** | Surface lines where the claimed deviated price doesn't match the contract price |
| **Identify unauthorized claims** | Flag claims for items or contracts not in the system |
| **Reduce manual effort** | Replace ad-hoc spreadsheet comparison with a structured, repeatable monthly workflow |
| **Increase trust** | Every reconciliation run produces a reviewable audit trail |
| **Support accountability** | Exceptions require explicit human decisions — no silent auto-correction |
| **Verify with sales data** | Optionally cross-reference claims against NetSuite to confirm sales actually occurred |

---

## 3. Scope and Non-Goals

### In Scope

- Upload and stage monthly distributor claim files
- Upload and stage NetSuite sales data exports (optional second dimension)
- Compare claim lines against stored contract terms (primary validation)
- Cross-reference claims against NetSuite sales data (secondary verification)
- Exception detection and categorization
- Suggested actions for each exception
- Human review and approval workflow
- Approved changes flow through existing record create/update path (with full validation and audit)
- Reconciliation run history and metrics

### Non-Goals (Explicitly Out of Scope)

- **Auto-correction of live records.** The system compares, suggests, and requires explicit approval. No direct auto-write into `rebate_records`.
- **Rebate payment processing.** This system validates claims and manages master data. Actual payment/credit to the distributor is downstream.
- **Real-time NetSuite integration.** Files are uploaded manually or via scheduled export. No live API connection in this phase.
- **Distributor portal / self-service.** Distributors do not upload files themselves. Internal staff uploads on their behalf.
- **Invoice generation.** Downstream of this system entirely.

---

## 4. Claim Validation Workflow

### 4.1 High-Level Flow

```
┌──────────────────┐    ┌──────────────────┐
│ Distributor sends │    │ NetSuite saved   │
│ monthly claim     │    │ search export    │
│ file              │    │ (optional)       │
└────────┬─────────┘    └────────┬─────────┘
         │                       │
         ▼                       ▼
┌──────────────────────────────────────────┐
│          STAGING                          │
│  Parse, validate format, store rows      │
│  in staging tables (NOT live records)     │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│          CLAIM VALIDATION RUN             │
│  Compare each claim line against:        │
│    1. Stored contract terms (primary)     │
│    2. NetSuite sales data (if available)  │
│  Produce categorized exceptions           │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│          EXCEPTION REVIEW                 │
│  Human reviews each exception             │
│  Selects action: approve, adjust, reject, │
│  defer, flag for investigation            │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│          APPROVAL & COMMIT                │
│  Approved claim lines are confirmed       │
│  Contract updates (if needed) flow        │
│  through existing validation + audit      │
└──────────────────────────────────────────┘
```

### 4.2 Detailed Steps

#### Step 1: Claim File Upload

1. User navigates to Reconciliation hub and starts a new reconciliation.
2. Selects the target distributor and the claim period (month/year).
3. Uploads the distributor's monthly claim file (Excel or CSV).
4. System parses the file, mapping distributor-specific columns to standard fields (see `CLAIM_FILE_SPEC.md`).
5. Format-level validation: required columns present, data types correct, no empty required fields.
6. Parsed rows are stored in a staging table (`claim_rows`), linked to a staging batch.
7. Original file is stored/referenced for traceability.
8. **No data enters `rebate_records` at this point.**

#### Step 2: NetSuite Export Upload (Optional)

1. User uploads the NetSuite saved search export covering the same period.
2. System parses against the NetSuite field spec (see `NETSUITE_SAVED_SEARCH_SPEC.md`).
3. Parsed rows stored in a staging table (`netsuite_sales_rows`), linked to a staging batch.
4. **No data enters `rebate_records` at this point.**

#### Step 3: Claim Validation Run

1. User initiates the validation run (explicit action, not automatic).
2. System validates each claim line against stored contract terms:
   - Resolve contract by Contract ID within the distributor
   - Resolve plan by plan code within the contract
   - Resolve item by Brennan part number (Vendor Item)
   - Find matching master record by plan + item with overlapping date range
   - Compare claimed deviated price against stored contract price (`rebatePrice`)
   - Check contract/plan is active for the claim date
3. If NetSuite data is available, cross-reference:
   - Did this sale actually appear in NetSuite for this distributor + item + date?
4. Produce categorized exceptions with suggested actions.
5. Store exceptions in `reconciliation_issues` table.

#### Step 4: Exception Review

1. User reviews exceptions in the reconciliation review UI.
2. Each exception shows: category, severity, the claim line data, the contract term data, and (if available) the NetSuite sales data.
3. User selects an action for each exception (or bulk-selects for groups):
   - **Approve** — claim line is valid, no contract change needed
   - **Adjust** — claim line is partially correct, adjust the amount or flag a correction
   - **Reject** — claim line does not match contract terms
   - **Defer** — mark for later review
   - **Update contract** — claim reveals the contract terms need updating (e.g., new item, price change)

#### Step 5: Approval & Commit

1. User confirms the batch of decisions.
2. For approved claim lines: mark as validated. These feed into downstream rebate payment processing (outside this system).
3. For claim lines that trigger contract updates:
   - The change flows through the existing `validateRecord()` service.
   - If validation passes, the record is created/updated via the standard path.
   - `auditService.logCreate()` / `auditService.logUpdate()` captures the change.
   - The audit entry is linked back to the reconciliation run for traceability.
4. Reconciliation run is marked complete with summary statistics.

---

## 5. Concepts and Terminology

| Term | Definition |
|------|------------|
| **Claim file** | A monthly file from a distributor listing items sold at deviated prices, with the rebate amount they believe they earned. |
| **Claim line** | One row in a claim file — a single transaction or order line. |
| **Claim period** | The month the claim covers (e.g., February 2026). |
| **Contract terms** | The approved rebate pricing stored in `rebate_records` — the source of truth for what was agreed. |
| **Deviated price** | The special contract price per unit (lower than standard). Stored as `rebatePrice` in the current schema. |
| **Standard price** | The normal/list price Brennan charges the distributor (aka "Current Vendor Price"). |
| **Extended discount owed** | The total rebate amount for a claim line: `(Standard Price - Deviated Price) × Quantity`. |
| **Reconciliation run** | A single execution of the claim validation engine against staged claim data. Produces a set of exceptions. |
| **Staging batch** | A parsed file stored in staging tables. Not live data. |
| **Exception** | A discrepancy detected during claim validation. Categorized by type and severity. |
| **Suggested action** | The system's recommendation for how to resolve an exception. Always requires human approval. |
| **Matching key** | The business key combination used to link claim lines to contract terms: contract number + plan code + item number (Brennan part number). |

---

## 6. Exception Categories

### 6.1 Claim-vs-Contract Exceptions (Primary)

These compare each claim line against stored contract terms:

| Code | Category | Severity | Description | Suggested Action |
|------|----------|----------|-------------|------------------|
| CLM-001 | Price Mismatch | Warning | Claimed deviated price differs from the contract price (`rebatePrice`) for this contract + plan + item. | Review — either the claim is wrong or the contract needs updating. |
| CLM-002 | Date Out of Range | Error | Claim line's transaction date falls outside the contract's effective date range (before start or after end). | Reject claim line — not covered by contract for this period. Or extend contract dates if appropriate. |
| CLM-003 | Item Not in Contract | Error | Claimed item (Brennan part number) is not found under the specified contract + plan. | Reject — item not covered. Or add item to contract if it should be. |
| CLM-004 | Contract Not Found | Error | Claim references a Contract ID that doesn't exist for this distributor. | Flag for investigation — possible data entry error or new contract needed. |
| CLM-005 | Plan Not Found | Error | Claim references a plan code not found under the matched contract. | Flag for investigation. |
| CLM-006 | Unknown Item | Info | Claimed Brennan part number doesn't exist in the items table at all. | Create item record, then validate claim. |
| CLM-007 | Contract Expired | Warning | Contract exists but is expired/ended before the claim period. | Reject claim line or renew contract. |
| CLM-008 | End User Mismatch | Warning | Claim line's end user doesn't match the end user on the contract. | Review — may indicate a legitimate new end user or an error. |
| CLM-009 | Duplicate Claim Line | Warning | Same contract + item + date appears multiple times in the claim file. | Flag for review — possible duplicate submission. |

### 6.2 Claim-vs-Sales Exceptions (Secondary — Requires NetSuite Data)

These cross-reference claim lines against NetSuite sales data:

| Code | Category | Status | Description |
|------|----------|--------|-------------|
| CLM-010 | No Sales Record | **NEEDS VALIDATION** | Distributor claims a rebate but no matching sale found in NetSuite for the period. **Only meaningful if the NetSuite export is comprehensive for the period.** |
| CLM-011 | Quantity Mismatch | **NEEDS VALIDATION** | Claimed quantity doesn't match NetSuite transaction quantity for the same item + date. **Requires confirmed matching logic — a single claim line may aggregate multiple sales transactions.** |
| CLM-012 | Sell Price vs Standard Price | **NEEDS BUSINESS RULE** | NetSuite sell price differs from the "Current Vendor Price" on the claim. **These may legitimately differ depending on pricing tiers, negotiation, etc. Do not implement without business rule.** |

### 6.3 Contract Health Exceptions (Proactive — No Claim Required)

These can be detected from contract data + NetSuite sales data alone, independent of claims:

| Code | Category | Status | Description |
|------|----------|--------|-------------|
| CLM-013 | Sales Without Contract | **NEEDS VALIDATION** | NetSuite shows sales to a distributor for items that have no active contract coverage. **Many items legitimately have no rebate. Only useful if the system knows which items are expected to have contracts.** |
| CLM-014 | Contract With No Sales | **NEEDS VALIDATION** | Active contract exists but no sales found in NetSuite for the period. **Only meaningful if the NetSuite export is complete.** |

### 6.4 Critical Prerequisite: Full-State vs Delta Claim Files

Distributor claim files are expected to be **monthly claim files** — they cover a specific period (one month). Each file contains all rebate-eligible transactions for that month.

This means:
- A claim file is effectively **full-state for the month** — if a sale isn't in the file, the distributor isn't claiming a rebate for it that month
- "Missing from claim" for a given month is meaningful (distributor didn't sell that item that month, or chose not to claim it)
- Row counts are meaningful for completeness checking within the month

**ASSUMPTION:** This is the expected behavior based on the confirmed monthly cadence. If some distributors submit partial/incremental claims, this needs per-distributor configuration.

**The same question applies to NetSuite exports.** The saved search should cover the same monthly period as the claim to enable meaningful cross-referencing.

---

## 7. Matching Rules (Conceptual)

### 7.1 Primary Matching: Claim Line → Contract Terms

```
For each claim line C:
  1. Find contract by C.contractId within the selected distributor
     → Not found: CLM-004
  2. Find plan by C.planCode within the contract
     → Not found: CLM-005
  3. Find item by C.vendorItem (Brennan part number)
     → Not found in items table: CLM-006
  4. Find master record by plan_id + item_id with date range covering C.transactionDate
     → Not found under this plan: CLM-003
     → Found but date out of range: CLM-002
     → Found but contract expired: CLM-007
  5. Compare C.deviatedPrice against master record's rebatePrice
     → Differs: CLM-001
  6. Compare C.endUser against contract's end user
     → Differs: CLM-008
  7. Check for duplicate lines in the same claim file
     → Duplicate found: CLM-009
  8. All match → clean line (claim approved against contract terms)
```

### 7.2 Secondary Matching: Claim Line → NetSuite Sales

```
For each validated claim line C (optional, if NetSuite data staged):
  1. Find sales row(s) by distributor + C.vendorItem + date within claim period
     → Not found: CLM-010
  2. Compare quantities
     → Significant difference: CLM-011
```

### 7.3 Column Mapping: Distributor-Specific → Standard

Each distributor may use different column names and include different fields. The system needs a mapping layer:

```
Fastenal claim file             →  Standard claim fields
─────────────────────────────────────────────────────────
"Contract ID"                   →  contractNumber
"Vendor Item"                   →  itemNumber (Brennan part #)
"Item"                          →  distributorItemNumber (their SKU)
"Customer" / "Name"             →  endUserCode / endUserName
"Date"                          →  transactionDate
"Current Vendor Price"          →  standardPrice
"Deviated Price"                →  deviatedPrice (compared against rebatePrice)
"QTY"                           →  quantity
"Extended Discount Owed"        →  claimedAmount
"Order no"                      →  distributorOrderNumber
"Vendor"                        →  vendorName (Brennan — for validation)
"Description"                   →  itemDescription
```

Other distributors will have their own column layouts. The mapping is per-distributor configuration. See `CLAIM_FILE_SPEC.md` for the standard field set and known mappings.

### 7.4 Item Number Matching

The Fastenal claim includes **two item numbers**:
- **Item** (e.g., 04017578) — Fastenal's internal SKU
- **Vendor Item** (e.g., 6801-12-12-NWO-FG) — Brennan's part number

Matching should use the **Brennan part number** (Vendor Item) since that's what's stored in `items.itemNumber` in the RMS. The distributor's internal SKU is stored for reference but not used as a matching key.

**Fuzzy matching consideration:** Start with exact match on Brennan part number. Track match failure rates. If significant, add normalization (trim whitespace, uppercase, strip dashes) as a configurable second pass.

---

## 8. Recommended UI Surfaces

### 8.1 Reconciliation Hub — Route: `/reconciliation`

The primary entry point for claim reconciliation work. Replaces the old Import page.

**Content:**
- **Active reconciliation runs** — in-progress runs awaiting review
- **New reconciliation** button — starts the wizard
- **Recent completed runs** — history with summary stats (claim lines, exceptions, approved, rejected)
- **Quick filters** — by distributor, by claim period, by status

**Sidebar update:** Replace "Import" nav item with "Reconciliation" nav item.

### 8.2 New Reconciliation Wizard — Route: `/reconciliation/new`

A multi-step guided workflow:

```
Step 1: Select Distributor and Claim Period
  → Choose distributor
  → Select claim month/year

Step 2: Upload Claim File
  → Upload the distributor's monthly claim file
  → System parses using distributor-specific column mapping
  → Show parse results: lines parsed, format errors, warnings
  → User confirms staging

Step 3: Upload NetSuite Export (optional)
  → Upload NetSuite saved search export for the same period
  → Show parse results
  → User confirms staging
  → (May be skipped for claim-only validation)

Step 4: Run Claim Validation
  → System validates each claim line against contract terms
  → Show summary: X lines validated, Y exceptions by category
  → Link to review queue
```

### 8.3 Reconciliation Review Queue — Route: `/reconciliation/[runId]/review`

The primary work surface for reviewing exceptions.

**Layout:**
- **Summary bar** — total claim lines, validated, exceptions by category/severity
- **Filter bar** — filter by exception category, severity, contract, item, end user
- **Exception table** — one row per exception with:
  - Category and severity badge
  - Claim line data (item, price, qty, date, end user)
  - Contract term data (stored price, date range, status)
  - NetSuite sales data (if available)
  - Suggested action
  - Action dropdown (approve, adjust, reject, defer, update contract)
- **Bulk actions** — select multiple exceptions, apply action to all
- **Commit button** — finalize all decisions (with confirmation dialog)

### 8.4 Dashboard Implications

The main dashboard (`/`) should evolve to show reconciliation health:
- **Reconciliation status card** — runs pending review, claim lines unresolved
- **Distributor health** — which distributors have recent reconciliation, which are overdue for the month
- **Exception trends** — are exception counts increasing or decreasing over time

### 8.5 Distributor Page Implications

The distributor index page (`/distributors`) should show reconciliation status:
- Last reconciliation date and period
- Unresolved exception count
- Overall health indicator (clean / needs attention / overdue)

---

## 9. Recommended Schema Direction (Conceptual)

> **Note:** These are conceptual models to guide implementation. They are NOT ready for Prisma schema yet. Actual schema will be refined during implementation based on real sample files and confirmed business rules.

### 9.1 Staging Tables

#### `reconciliation_runs`
Tracks each claim validation execution.

| Field | Type | Purpose |
|-------|------|---------|
| id | INT (PK) | |
| distributorId | INT (FK → distributors) | Target distributor |
| claimPeriodStart | DATE | First day of claim month |
| claimPeriodEnd | DATE | Last day of claim month |
| status | VARCHAR | draft, staged, running, review, completed, cancelled |
| claimBatchId | INT (FK → claim_batches) | Linked claim file |
| salesBatchId | INT? (FK → netsuite_sales_batches) | Linked NetSuite export (optional) |
| totalClaimLines | INT | Lines in the claim file |
| validatedCount | INT | Lines that matched contract terms cleanly |
| exceptionCount | INT | Total exceptions found |
| approvedCount | INT | Claim lines approved |
| rejectedCount | INT | Claim lines rejected |
| approvedAmount | DECIMAL(12,4) | Total approved rebate amount |
| rejectedAmount | DECIMAL(12,4) | Total rejected rebate amount |
| runById | INT (FK → users) | User who initiated |
| startedAt | TIMESTAMP | |
| completedAt | TIMESTAMP? | |

#### `claim_batches`
Tracks uploaded claim files.

| Field | Type | Purpose |
|-------|------|---------|
| id | INT (PK) | |
| distributorId | INT (FK → distributors) | |
| claimPeriodStart | DATE | Month covered |
| claimPeriodEnd | DATE | Month covered |
| fileName | VARCHAR | Original file name |
| fileHash | VARCHAR | SHA-256 for duplicate file detection |
| totalRows | INT | Rows parsed |
| validRows | INT | Rows passing format validation |
| errorRows | INT | Rows failing format validation |
| status | VARCHAR | uploaded, parsed, staged, error |
| columnMappingId | INT? | Per-distributor column mapping used |
| uploadedById | INT (FK → users) | |
| createdAt | TIMESTAMP | |

#### `claim_rows`
Individual parsed claim lines.

| Field | Type | Purpose |
|-------|------|---------|
| id | INT (PK) | |
| batchId | INT (FK → claim_batches) | |
| rowNumber | INT | Original row in file |
| contractNumber | VARCHAR? | Claimed contract ID |
| planCode | VARCHAR? | Claimed plan code (if present) |
| itemNumber | VARCHAR? | Brennan part number (Vendor Item) |
| distributorItemNumber | VARCHAR? | Distributor's internal SKU |
| endUserCode | VARCHAR? | End user code from claim |
| endUserName | VARCHAR? | End user name from claim |
| transactionDate | DATE? | Sale date |
| standardPrice | DECIMAL(12,4)? | Current vendor price |
| deviatedPrice | DECIMAL(12,4)? | Claimed deviated price |
| quantity | DECIMAL(12,4)? | Quantity sold |
| claimedAmount | DECIMAL(12,4)? | Extended discount owed |
| distributorOrderNumber | VARCHAR? | Distributor's PO/order number |
| rawData | JSONB | Original row data for traceability |
| parseErrors | JSONB? | Format-level parse errors |
| matchedRecordId | INT? | If matched to a master record during validation |
| status | VARCHAR | parsed, validated, unmatched, error |

#### `netsuite_sales_batches`
Tracks uploaded NetSuite export files. (Unchanged from prior design.)

| Field | Type | Purpose |
|-------|------|---------|
| id | INT (PK) | |
| distributorId | INT? (FK → distributors) | If scoped to one distributor |
| periodStart | DATE? | Sales period covered |
| periodEnd | DATE? | Sales period covered |
| fileName | VARCHAR | |
| fileHash | VARCHAR | |
| totalRows | INT | |
| uploadedById | INT (FK → users) | |
| createdAt | TIMESTAMP | |

#### `netsuite_sales_rows`
Individual parsed rows from NetSuite export. (Unchanged from prior design.)

| Field | Type | Purpose |
|-------|------|---------|
| id | INT (PK) | |
| batchId | INT (FK → netsuite_sales_batches) | |
| rowNumber | INT | |
| transactionDate | DATE? | |
| distributorCode | VARCHAR? | Customer/distributor in NetSuite |
| itemNumber | VARCHAR? | |
| quantity | DECIMAL? | |
| unitSellPrice | DECIMAL? | **Note: This is the sell price, NOT the rebate amount** |
| lineTotal | DECIMAL? | |
| transactionType | VARCHAR? | Invoice, credit memo, etc. |
| rawData | JSONB | Original row for traceability |

#### `reconciliation_issues`
Exceptions detected during a claim validation run.

| Field | Type | Purpose |
|-------|------|---------|
| id | INT (PK) | |
| reconciliationRunId | INT (FK → reconciliation_runs) | |
| code | VARCHAR | CLM-001 through CLM-014 |
| severity | VARCHAR | error, warning, info |
| category | VARCHAR | Human-readable category name |
| description | TEXT | Specific description with values (e.g., "Claimed price $2.78, contract price $3.00") |
| claimRowId | INT? (FK → claim_rows) | Source claim line if applicable |
| salesRowId | INT? (FK → netsuite_sales_rows) | Source sales row if applicable |
| masterRecordId | INT? (FK → rebate_records) | Matched master record if applicable |
| suggestedAction | VARCHAR | approve, reject, adjust, update_contract, flag_review, create_item |
| suggestedData | JSONB? | Proposed field values for the suggested action |
| resolution | VARCHAR? | approved, rejected, adjusted, deferred, dismissed |
| resolutionNote | TEXT? | User's reason for the chosen resolution |
| resolvedById | INT? (FK → users) | |
| resolvedAt | TIMESTAMP? | |
| committedRecordId | INT? (FK → rebate_records) | If resolution created/updated a contract record |

### 9.2 Relationship to Existing Schema

- **`rebate_records`** — unchanged. These are the contract terms (source of truth). Reconciliation validates claims against them. If a claim reveals a needed contract update, the change flows through the existing create/update path. **No `reconciliation_run_id` column is added** — a single record may be touched by multiple reconciliation runs over time.
- **`import_batches`** — the existing table is retained for potential simple direct-import use cases (e.g., initial data migration), but reconciliation uses its own staging tables.
- **`audit_log`** — unchanged. All contract updates triggered by reconciliation are audit-logged through the existing service.

### 9.3 Traceability Model

Traceability from a live contract record back to the reconciliation that modified it is achieved through two mechanisms — not through a direct FK on `rebate_records`:

1. **`reconciliation_issues.committedRecordId`** — When a resolved exception creates or updates a contract record, the resulting record ID is stored on the issue. This provides forward lookup (reconciliation run → issues → affected records) and reverse lookup (record → which issues affected it).

2. **`audit_log`** — Every record change is audit-logged with user, timestamp, and field-level diff. Audit entries created during reconciliation commit can be correlated with the reconciliation run by timestamp and user.

**Why not a direct FK on `rebate_records`?** A record's lifecycle may span many reconciliation runs: created during contract setup, price confirmed in run #1, date extended in run #5. A single FK would only reflect the last run.

---

## 10. The Pricing Model

### How Rebates Work at Brennan

The rebate is a **price deviation** — the difference between Brennan's standard price and a lower contract-specific price for a particular end user.

```
Standard Price (Current Vendor Price)    = $5.52   (what Brennan normally charges)
Deviated Price (Contract Price)          = $2.78   (special approved price)
Discount Per Unit                        = $2.74   (standard - deviated)
Quantity Sold                            = 150
Extended Discount Owed (Rebate Amount)   = $411.00 (discount × quantity)
```

The distributor sells to the end user at or near the deviated price. Brennan compensates the distributor for the price difference.

### What the RMS Stores

The **deviated price** is the contract term that Brennan approves and stores per contract + plan + item. This is currently stored as `rebatePrice` in `rebate_records`.

> **ASSUMPTION (pending confirmation):** `rebatePrice` = deviated price (the approved contract price per unit). The field name is somewhat misleading — it stores the contract price, not a per-unit rebate dollar amount. A rename to `deviatedPrice` or `contractPrice` may be warranted for clarity. See Section 12.

### What the Claim Validation Checks

The primary price validation is:

```
Does claim.deviatedPrice == contractRecord.rebatePrice?
```

If they differ, that's CLM-001 (Price Mismatch). The reviewer decides whether the claim is wrong or the contract needs updating.

The system also stores the **standard price** and **claimed amount** from the claim file for reference and audit, but does not currently maintain a "standard price" on the contract record. Standard prices may change over time independently of contract terms.

---

## 11. Explicit Business Questions / Unresolved Decisions

### Resolved

| # | Question | Resolution |
|---|----------|------------|
| Q5 | **How frequently do distributors submit files?** | **Monthly** — confirmed by sales. |
| Q4 | **Do all distributors use the same template format?** | **No** — each distributor has its own claim file format (confirmed by Fastenal sample). Per-distributor column mapping is needed. |
| Q3-partial | **Contract number availability in claims?** | **Yes** — Fastenal includes Contract ID. Brennan assigns 6-digit numeric contract numbers. |

### Critical (Blocks Core Design)

| # | Question | Impact if Wrong |
|---|----------|-----------------|
| Q1 | **Are claim files full-state for the month?** Do they include every sale for the period, or can they be partial? | Determines whether "no claim for item X this month" is meaningful. **Assumed: full-state per month.** |
| Q2 | **What period do NetSuite exports cover?** Specific month? Rolling window? | Determines whether cross-referencing is meaningful for a given claim period. |
| Q3 | **What does `rebatePrice` actually represent?** Is it the deviated price (contract price per unit)? | **Assumed: yes, deviated price.** Pending explicit confirmation. Affects all price comparison logic. |

### High (Affects Scope)

| # | Question | Impact if Wrong |
|---|----------|-----------------|
| Q6 | **Are credits/returns included in claims or NetSuite exports?** | Affects quantity validation and amount calculations. |
| Q7 | **Do all distributors include Contract ID in their claims?** Fastenal does, but do others? | Without contract number, matching falls back to distributor + item only (less precise). |
| Q8 | **What is the expected volume?** Lines per claim file? | Affects whether validation can run synchronously or needs background processing. |
| Q9 | **Who should be able to run reconciliation?** | Affects auth model. |
| Q10 | **Does the claim file include plan codes?** Fastenal sample doesn't clearly show one. | Without plan code, matching is contract + item (may be ambiguous if same item appears in multiple plans). |

### Medium (Informs Design Details)

| # | Question | Impact if Wrong |
|---|----------|-----------------|
| Q11 | **What happens to unresolved exceptions?** Carry forward or start fresh? | Affects exception lifecycle. |
| Q12 | **Are there distributor-specific validation rules?** | May need per-distributor configuration beyond column mapping. |
| Q13 | **Should the system compute Extended Discount Owed?** Or trust the distributor's number? | Computation is trivial: (standard - deviated) × qty. Comparing computed vs claimed catches arithmetic errors. |

---

## 12. Field Naming Consideration: `rebatePrice`

The current schema uses `rebatePrice` for the per-unit price stored on contract records. Based on the confirmed business process, this field actually stores the **deviated price** — the special contract price, not a rebate dollar amount.

**Options:**
1. **Rename to `deviatedPrice`** — matches distributor claim terminology exactly
2. **Rename to `contractPrice`** — clearer business meaning, vendor-neutral
3. **Keep `rebatePrice`** — avoid schema change, add documentation/comments

**Recommendation:** Rename to `contractPrice` during a dedicated schema migration. This aligns with the business meaning (the approved contract price per unit) and avoids confusion with the computed rebate amount (standard - deviated). **This is a documentation note only — no code change in this pass.**

---

## 13. Recommended Phased Rollout

### Phase R1: Foundation — Claim File Staging

**Goal:** Accept, parse, and stage distributor claim files with per-distributor column mapping.

**Delivers:**
- Claim file upload UI (Steps 1-2 of wizard)
- Per-distributor column mapping configuration (starting with Fastenal)
- File parsing and format-level validation
- Staging tables for claim batches and rows
- Parse results preview (lines parsed, errors, warnings)

**Value:** Users can start uploading claim files and seeing parsed results even before the validation engine exists.

**Prerequisite:** Fastenal column mapping confirmed. Standard claim field set defined (see `CLAIM_FILE_SPEC.md`).

### Phase R2: Claim Validation Engine — Claim vs Contract

**Goal:** Compare staged claim lines against stored contract terms and produce exceptions.

**Delivers:**
- Matching engine (claim lines → contract terms by business key)
- Exception detection for CLM-001 through CLM-009
- Reconciliation run tracking
- Exception review UI
- Approve/reject/adjust/defer workflow
- Commit path for contract updates (through existing validation + audit)
- Summary statistics (approved amount, rejected amount, exception counts)

**Value:** The core claim validation loop is functional. Monthly reconciliation is operational.

### Phase R3: NetSuite Cross-Reference

**Goal:** Add NetSuite sales data as a verification dimension.

**Delivers:**
- NetSuite export upload and staging
- Cross-reference matching (claim ↔ sales)
- Sales-related exception rules (CLM-010, CLM-011, and potentially CLM-012/CLM-013/CLM-014 if business rules confirmed)
- Enhanced review UI showing claim + contract + sales data side by side

**Value:** Claims can be verified against actual sales data. Catches fraudulent or erroneous claims.

### Phase R4: Maturity — Analytics and Automation

**Goal:** Reconciliation becomes a routine monthly process with trend tracking.

**Delivers:**
- Dashboard reconciliation metrics
- Distributor health scores driven by reconciliation results
- Monthly reconciliation history and trend reporting
- Overdue reconciliation alerts (distributor hasn't submitted for current month)
- Bulk exception handling improvements
- Exception carry-forward across runs (if Q11 confirms this is needed)

**Value:** Shifts from reactive claim checking to proactive rebate program health monitoring.

---

## 14. Architecture Notes

### Service-Layer First

The claim validation engine should be implemented as server-side services:

- `src/lib/reconciliation/staging.service.ts` — file parsing, column mapping, staging, format validation
- `src/lib/reconciliation/validation.service.ts` — claim-vs-contract comparison, exception detection
- `src/lib/reconciliation/review.service.ts` — exception resolution, commit workflow
- `src/lib/reconciliation/mapping.service.ts` — per-distributor column mapping configuration

These services are called from API routes or server components. They do not depend on client-side state.

### Relationship to Existing Services

| Existing Service | Role in Reconciliation |
|-----------------|----------------------|
| `validation.service.ts` | Called during commit phase — contract updates go through `validateRecord()` |
| `audit.service.ts` | Called during commit phase — contract changes are audit-logged |
| `dates.ts` utilities | Used during matching — `deriveRecordStatus()`, `datesOverlap()` for date comparison |

### No API-First Bias

Server components can call services directly for read operations (matching the current Records page pattern). Dedicated `/api/reconciliation/*` routes added as needed for client-driven interactions (wizard steps, review actions).

---

## 15. Relationship to Old Import Pipeline

The original import pipeline concept has been **fully superseded** by claim reconciliation:

| Old Import Concept | Claim Reconciliation Equivalent |
|-------------------|-------------------------------|
| Upload file | Upload claim file (Phase R1) |
| Map columns | Per-distributor column mapping configuration |
| Validate rows | Format validation during staging + claim validation against contracts |
| Preview results | Exception review queue with claim + contract + sales context |
| Confirm import | Approve/reject claim lines, commit contract updates |

The `import_batches` table in the existing schema remains for potential one-off data migrations but is not the primary data flow.

**The Import page (`/import`) will be replaced by the Reconciliation hub (`/reconciliation`).**
