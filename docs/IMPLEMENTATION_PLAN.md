# Rebate Management System - Implementation Plan

> **This document defines the concrete build plan for the RMS.** It covers tech stack, build order, dependencies, milestones, and risks. For system specifications, see `SYSTEM_DESIGN.md`. For behavioral guidance, see `CLAUDE.md`.

---

## 1. Pre-Build Decisions

### 1.1 Recommended Tech Stack: Next.js + PostgreSQL + Prisma

| Layer | Technology | Rationale |
|---|---|---|
| Runtime | Node.js 20 LTS | Stable, long-term support |
| Framework | Next.js 16+ (App Router) | Server components, API routes, middleware — one deployable unit |
| Language | TypeScript 5.9 (strict mode) | End-to-end type safety, shared types between API and frontend |
| ORM | Prisma 6.x | Schema-as-code, typed queries, first-class migration tooling |
| Database | PostgreSQL 15+ | JSONB for audit diffs, DECIMAL for prices, excellent date support |
| Data Grid | HTML tables (custom) | Simple filterable/sortable tables for Phase 1; AG Grid deferred |
| UI Framework | Tailwind CSS v4 | Custom Brennan theme (Primary Blue #006293), no shadcn dependency |
| Forms | Native React forms | Server-validated; Zod/React Hook Form deferred |
| Auth | NextAuth.js v5 (beta) | Credentials provider now, AD/LDAP in Phase 2 |
| File Parsing | SheetJS (xlsx) | Excel and CSV parsing for reconciliation template/sales staging (not yet implemented) |
| File Export | ExcelJS | Excel generation with formatting (not yet implemented) |
| Background Jobs | BullMQ + Redis | Reconciliation processing, future alert jobs (Redis in Docker Compose, BullMQ not yet wired) |
| Testing | Vitest (unit) | Fast unit tests; Playwright E2E deferred to Phase 2 |
| Containerization | Docker + Docker Compose | PostgreSQL 15 + Redis containers |
| Date Library | date-fns | Lightweight, tree-shakeable, immutable date operations |
| Password Hashing | bcryptjs | Credential-based auth password hashing |

**Why this stack over the alternatives:**
- Single language (TypeScript) end-to-end eliminates context switching
- One deployable unit (Next.js) + one database reduces operational burden
- Prisma's schema-first approach aligns with the project's data-model-governance requirements

**This recommendation is contingent on stakeholder input** — if the org is a .NET/Microsoft shop, Option B from SYSTEM_DESIGN.md Section 10.2 may be a better fit. Tech stack decision should be confirmed after the discovery meeting.

### 1.2 Key Library Decisions

| Decision | Primary | Alternative | Notes |
|---|---|---|---|
| Data grid | HTML tables (custom) | AG Grid / TanStack Table | Custom tables used in Phase 1; richer grid deferred |
| Date library | date-fns | dayjs | Lightweight, tree-shakeable, immutable. Used consistently — no raw `Date` methods |
| State management | Server components + fetch | TanStack Query / SWR | Server components with `dynamic = "force-dynamic"` for DB reads; client wrappers for interactivity |
| File upload | TBD | react-dropzone | Reconciliation wizard file upload not yet implemented |

---

## 2. Project Structure

```
rebate-management-system/
  prisma/
    schema.prisma                # Database schema (source of truth)
    seed.ts                      # Dev seed data (distributors, contracts, plans, items, records)
  src/
    app/                         # Next.js App Router
      (auth)/login/              # Login page
      (dashboard)/               # Protected layout
        distributors/            # Distributor list + detail pages
          [id]/                  # Distributor detail (records scoped to distributor)
        records/                 # Global records view
        import/                  # Placeholder — will be replaced by reconciliation/
        reconciliation/          # Reconciliation hub + wizard + review (planned)
        audit/                   # Audit log page
      api/                       # API route handlers (thin — delegate to services)
        auth/[...nextauth]/
        distributors/
        contracts/
        plans/
        records/
          [id]/                  # Single record CRUD
        items/
        reconciliation/          # Reconciliation API (planned)
        imports/                 # Legacy — retained for one-off migration only
        audit/
        export/
    lib/
      db/
        client.ts                # Prisma singleton
      audit/
        audit.service.ts         # logCreate, logUpdate, logDelete
        diff.ts                  # computeFieldDiff, computeInsertSnapshot
        __tests__/diff.test.ts
      validation/
        validation.service.ts    # Centralized validation (create + update)
        types.ts                 # ValidationResult, ValidationItem types
      auth/
        config.ts                # NextAuth config (Credentials provider, JWT)
        index.ts                 # Auth handler exports
        roles.ts                 # canEdit(), role checks
        session.ts               # getSessionUser()
      constants/
        statuses.ts              # Status enums and derivation constants
        validation-codes.ts      # VAL-NNN codes
      types/
        api.ts                   # API types
      utils/
        dates.ts                 # deriveRecordStatus(), datesOverlap(), stripTime(), safeParseDate()
        __tests__/dates.test.ts
    components/
      records/
        records-page-client.tsx  # Client wrapper for global records page
        distributor-detail-client.tsx  # Client wrapper for distributor detail page
        record-modal.tsx         # Create/edit modal with validation display + warning confirmation
        status-badge.tsx         # Color-coded status badges
      distributors/
        distributors-page-client.tsx  # Client wrapper for distributor list
      audit/
        audit-page-client.tsx    # Client wrapper for audit log page
      layout/
        header.tsx               # App header
        sidebar.tsx              # Sidebar navigation
      providers/
        session-provider.tsx     # NextAuth session provider
      ui/                        # Base UI components
    middleware.ts                # Route protection (redirect unauthenticated to /login)
  docker-compose.yml
  .env.example
```

---

## 3. Phase 1 Build Order — 13 Steps

### Step 1: Project Scaffolding, Database Schema, Migrations -- COMPLETE

**What was built:**
- Next.js project with TypeScript 5.9, Tailwind CSS v4, ESLint 9 (flat config)
- Docker Compose for PostgreSQL 15 + Redis
- Prisma schema defining all core tables per SYSTEM_DESIGN.md Section 5
- Seed script with realistic test data (6 distributors: FAS, MOTION, HSC, AIT, LGG, TIPCO; contracts, plans, items, rebate records, end users)
- Environment configuration

**Key files:**
- `docker-compose.yml`
- `prisma/schema.prisma` — complete data model
- `prisma/seed.ts`
- `src/lib/db/client.ts` — Prisma singleton
- `src/lib/constants/statuses.ts` — all status enums
- `src/lib/constants/validation-codes.ts` — VAL codes
- `.env.example`

**Schema notes:**
- Entity hierarchy: distributors -> contracts -> rebate_plans -> rebate_records <- items
- End users linked to contracts (one contract per end user per distributor)
- Composite index on `(rebate_plan_id, item_id, start_date)` for overlap detection
- Index on `audit_log(table_name, record_id)` for per-record history
- `rebate_price` as `Decimal @db.Decimal(12, 4)`
- `audit_log.changed_fields` as `Json @db.JsonB`

**Dependencies:** None (first step)
**Complexity:** Medium

---

### Step 2: Type Definitions and Repository Layer -- PARTIALLY COMPLETE

**What was built:**
- Shared TypeScript types for API (`src/lib/types/api.ts`)
- Date utility functions: `deriveRecordStatus()`, `datesOverlap()`, `stripTime()`, `safeParseDate()`
- 41 unit tests for date utils and audit diff functions

**What is NOT yet built:**
- Dedicated repository classes (CRUD currently done inline in API routes and page server components)
- Pagination/sorting/filtering helper utilities (pagination done ad-hoc in API routes)

**Key files:**
- `src/lib/types/api.ts`
- `src/lib/utils/dates.ts` — `deriveRecordStatus()`, `datesOverlap()`, `stripTime()`, `safeParseDate()`
- `src/lib/utils/__tests__/dates.test.ts` — unit tests for all date utility functions

**Rules:** Repositories should never contain business logic — no validation, no status derivation, no audit logging.

**Dependencies:** Step 1
**Complexity:** Medium
**Tests:** Unit tests for all date utility functions (6 status paths, overlap edge cases, null end dates, same-day boundaries) — COMPLETE

---

### Step 3: Validation Service -- COMPLETE

**What was built:**
- Centralized validation service used for both create AND update paths
- Structured validation results with field, code, severity, message
- Warning confirmation flow (UI allows proceeding past warnings with explicit confirmation)

**Key files:**
- `src/lib/validation/validation.service.ts` — single entry point for record validation
- `src/lib/validation/types.ts` — ValidationResult, ValidationItem types

**Critical design:** Validation is called from both the create and update API routes. The same validation service is used for all entry points. Warning-severity results are surfaced in the UI via the record modal's confirmation flow.

**Note:** Validation rules are currently implemented within the single service file rather than split into separate rule files (required-fields, date-rules, duplicate-detection, overlap-detection, business-warnings). This is a candidate for future refactoring.

**Dependencies:** Steps 1, 2
**Complexity:** Large
**Tests:** Validation tested indirectly via API; dedicated validation unit tests not yet extracted.

---

### Step 4: Service Layer (Business Logic, CRUD, Supersede) -- PARTIALLY COMPLETE

**What was built:**
- CRUD operations for rebate records via API routes (create, read, update, delete)
- Status derivation at read time (derived from dates, not stored)
- Validation on create and update paths
- Audit logging on all write operations

**What is NOT yet built:**
- Dedicated service classes (business logic currently lives in API route handlers)
- Supersede workflow (end-date old, create new, link chain, audit both)
- Expire workflow
- Formal `getRecordsByDistributor()` service method (done via direct Prisma queries in page components)

**Current architecture:**
- API routes in `src/app/api/records/route.ts` and `src/app/api/records/[id]/route.ts` handle CRUD directly with Prisma
- Server components in dashboard pages query Prisma directly for reads
- Client wrapper components (`RecordsPageClient`, `DistributorDetailClient`) handle interactivity

**Key operations available:**
- `POST /api/records` — validate, create, audit
- `GET /api/records` — list with filtering
- `PUT /api/records/[id]` — validate, update, audit with field diff
- `DELETE /api/records/[id]` — delete, audit

**Needs:** Extract business logic from API routes into dedicated service classes per CLAUDE.md Section 7. Services should receive `userId` — no anonymous changes.

**Dependencies:** Steps 2, 3
**Complexity:** Large

---

### Step 5: Audit Logging Infrastructure -- COMPLETE

**What was built:**
- Audit service with `logCreate()`, `logUpdate()`, `logDelete()`
- Field-level diff computation (`computeFieldDiff()` for updates, `computeInsertSnapshot()` for creates)
- Audit log page with filtering by table, action, user, and date range
- All write operations on rebate records generate audit entries

**Key files:**
- `src/lib/audit/audit.service.ts` — logCreate, logUpdate, logDelete
- `src/lib/audit/diff.ts` — `computeFieldDiff()`, `computeInsertSnapshot()`
- `src/lib/audit/__tests__/diff.test.ts` — unit tests for diff functions
- `src/app/api/audit/route.ts` — audit log query API
- `src/app/(dashboard)/audit/page.tsx` — audit log page
- `src/components/audit/audit-page-client.tsx` — client-side filtering

**Design:** Audit called explicitly by API route handlers on each write. Audit entries are append-only (no update or delete).

**Dependencies:** Steps 1, 2
**Complexity:** Medium
**Tests:** Unit tests verify diff produces correct old/new values. INSERT captures full snapshot. UPDATE captures only changed fields.

---

### Step 6: API Endpoints -- COMPLETE

**What was built:**
- REST routes for core entities: distributors, contracts, plans, records (CRUD), items, audit
- Request parsing, response formatting
- Pagination and filtering query parameters
- Validation errors return structured `{ errors: [...], warnings: [...] }`
- Role-based write protection (`getSessionUser()` + `canEdit()`)

**Key files:**
- `src/app/api/distributors/route.ts`
- `src/app/api/contracts/route.ts`
- `src/app/api/plans/route.ts`
- `src/app/api/records/route.ts` — list + create
- `src/app/api/records/[id]/route.ts` — get + update + delete
- `src/app/api/items/route.ts`
- `src/app/api/audit/route.ts`
- `src/app/api/imports/` — legacy, retained for one-off migration; replaced by reconciliation API
- `src/app/api/export/` — exists but not yet functional

**Note:** Routes currently contain business logic inline rather than delegating to a service layer. This is a known area for future refactoring per CLAUDE.md Section 7.

**Dependencies:** Steps 4, 7
**Complexity:** Large (many endpoints, each thin)

---

### Step 7: Authentication and Authorization -- COMPLETE

**What was built:**
- NextAuth.js v5 (beta) with Credentials provider and JWT strategy
- Password hashing (bcryptjs)
- Role-based access: admin, rebate_manager, viewer
- Route protection via Next.js middleware (`src/middleware.ts`) — redirects unauthenticated to `/login`
- Session helper (`getSessionUser()`) and role check (`canEdit()`) for API write protection
- Seed users: admin/admin123, jwood/manager123, viewer/viewer123

**Authorization matrix:**

| Action | Admin | Manager | Viewer |
|---|---|---|---|
| View records, distributors, audit | Yes | Yes | Yes |
| Create/edit/supersede/expire records | Yes | Yes | No |
| Run reconciliation / import data | Yes | Yes | No |
| Export data | Yes | Yes | Yes |
| Manage users | Yes | No | No |

**Key files:**
- `src/lib/auth/config.ts` — NextAuth configuration
- `src/lib/auth/index.ts` — auth handler exports
- `src/lib/auth/roles.ts` — `canEdit()` role check
- `src/lib/auth/session.ts` — `getSessionUser()` helper
- `src/middleware.ts` — route protection
- `src/app/api/auth/[...nextauth]/route.ts` — NextAuth API route
- `src/app/(auth)/login/page.tsx` — login page
- `src/components/providers/session-provider.tsx` — NextAuth session provider

**Dependencies:** Steps 1, 2
**Complexity:** Medium

---

### Step 8: Reconciliation — SUPERSEDES IMPORT PIPELINE -- NOT YET IMPLEMENTED

> **Design change:** The original simple import pipeline has been replaced by a monthly claim reconciliation workflow. The reconciliation validates distributor rebate claims against stored contract terms. See `docs/RECONCILIATION_DESIGN.md` for the complete design, `docs/CLAIM_FILE_SPEC.md` for claim file mappings, and `docs/NETSUITE_SAVED_SEARCH_SPEC.md` for the NetSuite export spec.

**What this becomes (delivered in sub-phases):**

#### Phase R1: Claim File Staging
- Claim file upload with per-distributor column mapping (starting with Fastenal)
- Format-level validation (required fields, data types, dates, arithmetic checks)
- Staging tables for claim batches and rows (new schema)
- Parse results preview UI
- Reconciliation hub page (`/reconciliation`) replacing Import page

**Key files (planned):**
- `src/lib/reconciliation/staging.service.ts` — file parsing, staging, format validation
- `src/lib/reconciliation/mapping.service.ts` — per-distributor column mapping
- `src/lib/reconciliation/claim-parser.ts` — claim file parser using column mappings
- API routes under `src/app/api/reconciliation/`
- `src/app/(dashboard)/reconciliation/page.tsx` — reconciliation hub
- `src/components/reconciliation/upload-step.tsx` — file upload wizard step

#### Phase R2: Claim Validation Engine + Review
- Claim validation engine: each claim line validated against stored contract terms
- Exception detection (CLM-001 through CLM-009)
- Reconciliation run tracking with claim period (month/year)
- Exception review queue UI (claim data vs contract data side by side)
- Approve/reject/adjust/defer workflow
- Commit path for contract updates through existing validation + audit services
- Summary statistics (approved/rejected amounts)

**Key files (planned):**
- `src/lib/reconciliation/validation.service.ts` — claim-vs-contract comparison engine
- `src/lib/reconciliation/review.service.ts` — exception resolution, commit
- `src/app/(dashboard)/reconciliation/[runId]/review/page.tsx` — review queue

#### Phase R3: NetSuite Sales Verification
- NetSuite export upload and staging
- Claim-vs-sales cross-reference (did the claimed sale actually happen?)
- Sales verification exceptions (CLM-010, CLM-011)

#### Phase R4: Analytics and Maturity
- Dashboard reconciliation metrics
- Distributor health scores from reconciliation results
- Monthly reconciliation history and trend reporting

**Current state:** Import page exists at `src/app/(dashboard)/import/page.tsx` showing "Coming Soon" placeholder. Will be replaced by Reconciliation hub. The `import_batches` table exists but is retained only for one-off migrations — reconciliation uses its own staging tables.

**Critical prerequisite:** Fastenal column mapping is confirmed from actual sample file. Other distributor mappings needed as sample files are received. See `docs/CLAIM_FILE_SPEC.md` Section 4.

**Dependencies:** Steps 3, 4, 5, 6, 7 (same as original import — reconciliation reuses validation and audit services)
**Complexity:** Very Large (delivered across 4 sub-phases; most complex feature in the system)
**Tests:** Phase R1: claim file parsing fixtures (clean, missing columns, bad dates, wrong distributor, arithmetic mismatches). Phase R2: validation fixtures (exact match, price diff, date out of range, item not in contract, contract not found). Phase R3: sales cross-reference fixtures.

---

### Step 9: Export Functionality -- NOT YET IMPLEMENTED

**What needs to be built:**
- Export filtered view to .xlsx or .csv
- Metadata columns: derived status, last modified by/date
- Streaming response for large exports

**Key files (planned):**
- `src/lib/export/excel-generator.ts`
- `src/lib/export/csv-generator.ts`
- `src/app/api/export/records/route.ts`

**Current state:** `src/app/api/export/` directory exists but is not functional. Export/Settings removed from navigation sidebar.

**Dependencies:** Steps 4, 7
**Complexity:** Small-Medium
**Note:** Can be built in parallel with Steps 10-12.

---

### Step 10: Frontend — Core Views -- COMPLETE

**What was built:**
- App layout: sidebar nav, header with user menu
- Dashboard page with summary counts (active, expiring soon, expired, total records) computed from date-based queries
- Distributor list page: searchable table
- Distributor detail page: info header with scoped record table
- Global records page: all distributors, filterable table
- Status badges: Active (green), Expired (gray), Future (blue), Superseded (orange), Draft (yellow), Cancelled (red)
- Architecture: Server components with `dynamic = "force-dynamic"` for DB reads; client wrapper components for interactivity

**Key files:**
- `src/app/(dashboard)/layout.tsx` — protected dashboard layout
- `src/app/(dashboard)/page.tsx` — dashboard with summary counts
- `src/app/(dashboard)/distributors/page.tsx` — distributor list
- `src/app/(dashboard)/distributors/[id]/page.tsx` — distributor detail
- `src/app/(dashboard)/records/page.tsx` — global records view
- `src/components/records/records-page-client.tsx` — client wrapper for records page
- `src/components/records/distributor-detail-client.tsx` — client wrapper for distributor detail
- `src/components/distributors/distributors-page-client.tsx` — client wrapper for distributor list
- `src/components/records/status-badge.tsx` — color-coded status badges
- `src/components/layout/header.tsx`
- `src/components/layout/sidebar.tsx`

**Note:** Using custom HTML tables rather than AG Grid for Phase 1. Filter bar is basic (status, search). TanStack Query / React Query not yet adopted; using server components + client fetch wrappers.

**Dependencies:** Steps 6, 7
**Complexity:** Large

---

### Step 11: Frontend — Record Editor and Forms -- COMPLETE

**What was built:**
- Record editor modal (not slide-over panel — uses modal pattern)
- Create/edit forms with all fields
- Validation display: inline field errors, warning banners
- Warning confirmation flow: when warnings exist, user must explicitly confirm to proceed
- Hierarchical dropdowns (distributor -> contract -> plan, item selection)

**What is NOT yet built:**
- Supersede workflow UI (confirm end date -> pre-filled new record form)
- Expire confirmation dialog
- Notes section within editor
- Audit history tab within editor

**Key files:**
- `src/components/records/record-modal.tsx` — create/edit modal with validation display + warning confirmation

**Form behavior:** Dropdowns for contract, plan, item. Price as decimal input. Server validation results displayed after submit. Warning confirmation step before final save.

**Dependencies:** Steps 6, 10
**Complexity:** Large

---

### Step 12: Frontend — Reconciliation UI -- NOT YET IMPLEMENTED

> **Design change:** The original import wizard has been replaced by the reconciliation UI, which is a broader set of pages.

**What needs to be built (phased with Step 8):**

**Phase R1 UI:**
- Reconciliation hub page (`/reconciliation`) — active runs, history, new reconciliation button
- New reconciliation wizard — select distributor + claim period → upload claim file → parse results → stage
- Replaces the current Import page "Coming Soon" placeholder

**Phase R2 UI:**
- Review queue page (`/reconciliation/[runId]/review`) — exception table with filtering
- Exception detail — claim line data vs contract terms with suggested action
- Action controls — approve, reject, adjust, defer per exception (and bulk)
- Commit confirmation dialog with approved/rejected amount summaries

**Phase R3 UI:**
- NetSuite upload step in wizard
- Claim-vs-sales verification view (claim / contract / sales columns)

**Key files (planned):**
- `src/app/(dashboard)/reconciliation/page.tsx` — hub
- `src/app/(dashboard)/reconciliation/new/page.tsx` — wizard
- `src/app/(dashboard)/reconciliation/[runId]/review/page.tsx` — review queue
- `src/components/reconciliation/upload-step.tsx`
- `src/components/reconciliation/parse-results.tsx`
- `src/components/reconciliation/exception-table.tsx`
- `src/components/reconciliation/exception-detail.tsx`

**Sidebar change:** Replace "Import" nav item with "Reconciliation" nav item.

**Dependencies:** Steps 8 (reconciliation services), 10 (core UI patterns)
**Complexity:** Large (delivered incrementally across R1–R3)

---

### Step 13: Integration Testing, Polish, Data Migration -- NOT YET IMPLEMENTED

**What needs to be built:**
- Full workflow integration tests
- E2E smoke tests
- Error handling polish (toast notifications, loading/empty states)
- Data migration procedures for existing spreadsheets
- Performance verification with realistic volumes

**Key files (planned):**
- `tests/integration/full-crud-workflow.test.ts`
- `tests/integration/reconciliation-workflow.test.ts`
- `tests/integration/overlap-detection.test.ts`
- `tests/e2e/smoke-test.spec.ts`
- Test fixture spreadsheets

**Current test state:** 41 unit tests in Vitest covering date utilities and audit diff functions. No integration or E2E tests yet.

**Dependencies:** All prior steps
**Complexity:** Medium

---

## 4. Critical Path and Parallelization

```
Step 1: Schema .......................... COMPLETE
  |
  v
Step 2: Types + Date Utils .............. PARTIALLY COMPLETE (no repository classes)
  |
  +--> Step 7: Auth ..................... COMPLETE
  |
  v
Step 3: Validation ...................... COMPLETE
  |
  v
Step 4: Services ----> Step 5: Audit ... PARTIALLY COMPLETE / COMPLETE
  |                         |            (business logic in routes, not services)
  v                         v
Step 6: API <----- Step 7: Auth ........ COMPLETE (routes exist, logic inline)
  |
  +----------+-----------+
  |          |           |
  v          v           v
Step 10:   Step 8:     Step 9:
Core UI    Reconcil-   Export
COMPLETE   iation      NOT STARTED
  |        NOT STARTED
  v        (4 sub-phases: R1→R2→R3→R4)
Step 11:
Editor     Step 12:
COMPLETE   Reconciliation UI
  |        NOT STARTED (phased with Step 8)
  +----------+
  |
  v
Step 13: Integration Testing ........... NOT STARTED
```

**Summary of completion:**
- Steps fully complete: 1, 3, 5, 6, 7, 10, 11
- Steps partially complete: 2, 4 (types/utils done, repository/service classes not extracted)
- Steps not started: 8 (reconciliation — replaces import), 9, 12 (reconciliation UI), 13
- Design complete for: Step 8/12 — see `docs/RECONCILIATION_DESIGN.md`

---

## 5. User Milestones — When It Becomes Useful

### Milestone 1: "I can see my data" (Steps 1-2, 6-7, 10) -- COMPLETE

Log in, see distributor list, click a distributor, see records in a filterable table. Dashboard shows summary counts. Users verify the data model makes sense.

### Milestone 2: "I can manage records" (Steps 3-5, 11) -- COMPLETE

Create, edit records with full validation and warning confirmation flow. Audit trail. Users can stop using spreadsheets for new/changed records.

**Partially missing:** Supersede workflow, expire workflow, notes on records.

### Milestone 3: "I can validate monthly claims" (Steps 8-R1, 8-R2, 12) -- NOT YET STARTED

Upload distributor claim files, parse with per-distributor column mapping, validate each claim line against stored contract terms, review exceptions, approve/reject claims. Replaces the original "import my spreadsheets" milestone.

**Sub-milestones:**
- **3a: Claim file staging** (Phase R1) — Upload and parse distributor claim files using per-distributor column mapping (Fastenal first). Stage claim lines. Review parse results.
- **3b: Claim validation + review** (Phase R2) — Validate claim lines against contract terms, review exceptions, approve/reject/adjust, commit contract updates through existing validation and audit path.

### Milestone 4: "Sales-verified claims" (Step 8-R3) -- NOT YET STARTED

Add NetSuite sales data as a verification dimension. Cross-reference: did the claimed sales actually occur? Full claim validation workflow with sales verification.

### Milestone 5: "Production-ready" (Steps 9, 13) -- NOT YET STARTED

Export functionality. All workflows tested. Error handling polished. Real data migrated and verified. Reconciliation analytics and health metrics. Users switch entirely.

---

## 6. Phase 2 Outline

After Phase 1 core is stable. Primary focus: reconciliation.

| Feature | Description |
|---|---|
| **Reconciliation Phase R1** | Claim file staging: upload, parse with per-distributor column mapping, validate format, stage. Reconciliation hub page. See `docs/RECONCILIATION_DESIGN.md`. |
| **Reconciliation Phase R2** | Claim validation engine: claim lines ↔ contract terms. Exception detection (CLM-001–CLM-009), review queue, approve/reject/commit. |
| Dashboard enhancements | Expiring-soon lists, data quality alerts, reconciliation status metrics |
| Expiration alerts | Background job + email/in-app notifications for approaching expirations |
| Saved filters | Named filter presets for common queries |
| Bulk operations | Multi-select rows, bulk-update end date / expire / reassign |
| Global audit log enhancements | Advanced filtering, export (basic audit page exists) |
| Standard reports | All reports from SYSTEM_DESIGN.md Section 8.2 |
| Guided supersede workflow | Expire old record + create new version in one operation |

---

## 7. Phase 3 Outline

After Phase 2, when NetSuite export format is confirmed and integration targets identified:

| Feature | Description |
|---|---|
| **Reconciliation Phase R3** | NetSuite export staging + claim-vs-sales cross-reference (verify claimed sales occurred). |
| **Reconciliation Phase R4** | Reconciliation analytics: monthly trends, distributor health scores, overdue claim alerts. |
| Read/write REST API | Versioned, documented (OpenAPI) external API |
| CRM distributor sync | Auto-sync distributor master data from CRM |
| ERP validation | Validate items/contracts against ERP on entry |
| SSO / AD integration | Replace credentials with corporate identity provider |
| CRM activity write-back | Log rebate changes as CRM account activities |
| Advanced analytics | Trends, distributor comparisons, contract utilization |
| Automation rules | Auto-notify, auto-flag stale records, auto-create renewal drafts |

---

## 8. Risk Areas

### High Risk

**Claim reconciliation scope and complexity.** Monthly claim validation is fundamentally more complex than the original import pipeline. It involves claim-vs-contract comparison, per-distributor column mapping, exception categorization, review workflows, and staged data management. Delivered in 4 sub-phases (R1–R4) to manage risk. See `docs/RECONCILIATION_DESIGN.md`.

**Unresolved business questions.** Key questions remain: what does `rebatePrice` actually represent (assumed: deviated price, pending confirmation), do all distributors include contract numbers in claims (Fastenal does), NetSuite period scope (Q2). See `docs/RECONCILIATION_DESIGN.md` Section 11 for the full list.

**Per-distributor column mapping.** Each distributor has a different claim file format. Per-distributor column mapping configuration is needed. Fastenal mapping confirmed from actual sample. Other distributors require sample files. See `docs/CLAIM_FILE_SPEC.md`.

**Service layer extraction.** Business logic currently lives in API route handlers rather than dedicated service classes. This makes it harder to reuse logic (reconciliation commit path must call the same create/update logic) and harder to test in isolation. Should be addressed before building reconciliation Phase R2.

**Overlap detection performance.** Without proper indexing, the overlap query on every create/update could slow down at scale. Mitigated by composite index on `(rebate_plan_id, item_id)` — queries are bounded to one plan+item combination.

### Medium Risk

**Date timezone handling.** Dates stored as `DATE` (no time) in PostgreSQL, but JavaScript `Date` always includes timezone. Parsing "2025-01-15" in a browser in EST vs UTC can shift the date by one day. Must use `date-fns` `parseISO` consistently, never `new Date(string)`.

**Repository layer absence.** Direct Prisma calls are scattered across API routes and server components. As the system grows, this will make query logic harder to maintain and test. Should be consolidated before Phase 2.

### Low Risk

**Redis dependency.** If Redis adds too much operational complexity, reconciliation staging can use database-backed queues instead. Decide early.

**Prisma limitations.** Status derivation must happen in application code (which is the design intent). Overlap queries may need `prisma.$queryRaw` for complex date range conditions.

---

## 9. Immediate Next Steps

1. **Extract service layer** — move business logic from API route handlers into dedicated service classes (prerequisite for reconciliation — the commit path must be callable from reconciliation services)
2. **Confirm `rebatePrice` meaning** — verify that `rebatePrice` = deviated price (contract price per unit). Consider renaming to `contractPrice`. See `docs/RECONCILIATION_DESIGN.md` Section 12.
3. **Build reconciliation Phase R1** (Step 8) — claim file staging with Fastenal column mapping: upload, parse, validate, stage. The most critical remaining feature.
4. **Build reconciliation Phase R2** (Step 8) — claim validation engine, exception detection, review queue, approve/reject/commit workflow.
5. **Build export functionality** (Step 9) — can be done in parallel with reconciliation
6. **Add supersede and expire workflows** — missing from Step 4/11
7. **Integration and E2E tests** (Step 13) — verify full workflows including reconciliation end-to-end
