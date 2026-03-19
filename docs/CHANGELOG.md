# Changelog — Rebate Management System

All notable changes to this project are documented in this file, grouped by session.

---

## 2026-03-19 — Contract File Storage, Fastenal Test Data, File Hardening

### Contract File Storage (Schema Change)
- New `contract_files` table: stores original uploaded documents as bytea blobs
- Auto-archived on contract creation and contract update staging
- Documents panel on contract detail page (collapsible, with download/delete/upload)
- File types: `contract`, `update`, `spa`, `claim`, `document`

### File Storage Guardrails
- Shared `validateFileForStorage()` in `src/lib/constants/file-limits.ts`
- 10MB max file size, allowed extensions: xlsx, xls, csv, pdf, doc, docx
- Guardrails applied consistently: manual uploads, import archival, update archival
- `fileStorageWarning` returned to client when archival fails (not silent)
- Warning surfaced in contract wizard success screen and update upload flow
- `fileType` validated against allowlist on manual upload
- Numeric ID validation on file download/delete routes
- File deletion audit-logged via `auditService.logDelete()`
- Auto-stored files (contract/update) flagged in audit entries

### Fastenal SPA Test Data
- `CONTRACT (SPA) - Fastenal (Bayshore) 2026-03-19.xlsx` — 8 items in SPA format
- `CLAIM - Fastenal (mixed contracts) Mar2026.xlsx` — 8 rows, 2 contracts, 3 expected exceptions
- `UPDATE (SPA) - Fastenal (Bayshore) 2026-03-19.xlsx` — 2 price changes, 2 new, 2 removed

### Test Coverage
- 348 tests across 20 files (12 new file-limits tests)
- Covers: size validation, type validation, boundary conditions, edge cases

### Schema Note
- This repo uses `prisma db push` for schema management (no migration files)
- Railway `start.sh` runs `prisma db push` on each deploy

---

## 2026-03-19 — Manual Add Items, Fastenal SPA Import/Export, Reconciliation UX, Export Improvements

### Manual Add Items on Contract Detail
- "Update Contract" button is now a dropdown: **Upload File** or **Add Items Manually**
- Inline multi-row form: Part Number + Price + Description
- Multi-plan contracts require explicit plan selection (no silent default)
- Warnings from validation are surfaced — user must acknowledge before proceeding
- Partial failures shown clearly (no false "all saved" message)
- Auto-creates items if they don't exist (find-or-create)

### Create New Items from Record Modal
- "+ Create new item" link below item selector
- Inline form: part number + description → Create → auto-selects
- Items API returns existing item on 409 conflict

### Fastenal SPA Import/Export
- **Import**: Auto-detects Fastenal SPA form format (header rows 1-20, line items at row 22+)
- Extracts metadata: Agreement #, End User, Effective Date
- Parses Supplier P/N (column B) and Agreement Price (column G)
- Works with real Fastenal SPA files (verified with Bayshore SPA)
- Round-trip tested: Export → Re-import preserves all items and prices
- **Export**: "Export Fastenal SPA" button on FAS contract detail pages
- Generates Excel matching exact Fastenal SPA layout
- Only includes current operative records (active, started, not expired/superseded)
- Server-side restricted to FAS contracts only
- Filename: `{EndUser} SPA {date}.xlsx`

### "Deviated Price" → "Open Net Price"
- All user-facing labels updated across the system
- Auto-suggestion patterns match both old ("Deviated Price") and new ("Open Net Price") column names
- Internal field name `deviatedPrice` unchanged (no migration needed)

### Export Column Picker
- Records page Export CSV button is now a dropdown with column checkboxes
- Default: Item # and Rebate Price only
- "Select all" link for full export
- API accepts `?columns=item,price,contract` parameter

### Reconciliation UX — Contract Grouping
- Exception review groups issues and matched rows by contract number
- Per-contract headers: "Contract 100001 — 12 matched, 3 exceptions (2 pending)"
- "All OK" badge for contracts with zero exceptions
- Single-contract claims skip grouping (flat view)

### Reconciliation UX — Column Mapping Always Shown
- Upload now always shows column mapping review before processing
- Saved mapping merged with auto-suggestions from file headers
- User can adjust mapping every time — fixes errors when file columns change
- Required fields info box on upload panel

### Reconciliation UX — Button Cleanup
- Per-distributor "Upload" button changed to "Start →" (less redundant)

### Data Scoping Improvements
- Contract detail → Records deep link includes distributor + endUser
- CSV export uses endUserCode (unique) when available, falls back to name
- Export route supports `endUserCode` param for precise scoping

### Test Coverage
- 335 tests across 19 files
- New: SPA export filtering (7), CSV/Records scoping (5), multi-plan guard (2), deep-link scoping (2)

---

## 2026-03-18 — Action Reversibility Audit

### Contract Approval Undo
- Approved contracts can be reverted to `pending_review` via "Revert to Pending Review" button
- Rejected (cancelled) contracts can also be reverted — shows on a red banner with clear copy
- All transitions fully audited

### Record Restore
- New `POST /api/records/:id/restore` endpoint
- Cancelled records show a "Restore" button (green) on detail page and in table row actions
- Restores by re-deriving status from dates (active, expired, or future)
- Cancel confirmation dialog updated: "can be restored later" instead of "cannot be undone"

### Confirmation Dialogs
- Contract reject now has `confirm()` dialog
- All destructive actions verified to have confirmation before execution

### Reversibility Summary
| Action | Reversible | Method |
|--------|-----------|--------|
| Contract approve | Yes | Revert to Pending Review |
| Contract reject | Yes | Revert to Pending Review |
| Record cancel | Yes | Restore button |
| Record expire | Yes | Edit end date |
| Record supersede | No (by design) | Immutable history chain |
| Reconciliation commit | No (by design) | Atomic master data |
| Contract update commit | No (by design) | Atomic master data |

### Seed Data
- Seed simplified to users, distributors, and end users only — no sample contracts/records
- Upload test data to populate from scratch

---

## 2026-03-18 — Contract Updates, Approval Workflow, Reconciliation UX Split

### Contract Update Management (Phases A–E)
- Evergreen contract support: `contractType` (fixed_term|evergreen), `noticePeriodDays`, `lastReviewedAt`
- Contract update diff engine: upload spreadsheet → match items → detect changed/added/removed
- Review/approval UI at `/contracts/[id]/update/[runId]` with stepper
- Commit service applies approved diffs (supersede, create, skip)
- Ambiguous multi-plan matching protected server-side
- Future-effective dates constrained to today-or-earlier
- Contract activity timeline derived from audit + update runs + reconciliation
- Contract dispute history panel scoped by (distributorId, contractNumber)

### Contract Approval Workflow
- New contracts start as `pending_review` instead of `active`
- `POST /api/contracts/:id/approve` — approve → active, reject → cancelled
- Amber approval banner on contract detail page with Approve/Reject buttons
- Dashboard shows pending review count on Contracts metric card
- VAL-017 warning when adding records to unapproved contracts

### Customer # and Hidden Plans
- `customerNumber` field on Contract (non-unique, per-distributor-location ID)
- Plan codes hidden from new contract setup UX (auto-created default plan)
- Multi-plan contracts retain Plan column for legacy visibility

### Reconciliation UX Split (Phases R-A, R-B)
- Extracted ReviewPanel (~700 lines) into `review-panel.tsx`
- Shared types moved to `src/lib/reconciliation/types.ts`
- New dedicated run workflow page at `/reconciliation/run/[id]` with 4-step stepper
- Checklist actions now link to dedicated run page
- Upload creates run then redirects to run workflow
- Inline validation/review/commit panels removed from checklist page
- `reconciliation-page-client.tsx`: 2,236 → 1,227 lines

### UX Improvements
- Contract wizard: auto-reads file on upload (no manual "Read" button), Clear button, auto-scroll to preview
- "Update Pricing" renamed to "Update" / "Update Contract" across UI
- Status labels use human-readable names (e.g., "Pending Review" not "pending_review")

### Test Coverage
- 314 tests across 18 files (up from 240/14)
- New: contract-update (multiple), contract-approval (9), contract-activity (8), validation.service (38)

---

## 2026-03-17 — Reconciliation Issue Review Enhancement

### Expandable Issue Detail Rows (New)
- Issue rows in the exception review table are now clickable — expand inline to show full claim and master data context
- **Claim Data column** — shows all claim row fields: contract number, item number, claimed price, quantity, line amount, transaction date, end user, order number
- **Master Data / Comparison column** — issue-type-specific detail panels:
  - **CLM-001 (Price Mismatch)**: Visual price comparison boxes — contract price vs claimed price with diff
  - **CLM-003 (Item Not in Contract)**: Contract, item, target plan, claimed price, available plan IDs
  - **CLM-004 (Contract Not Found)**: Searched contract number with guidance text
  - **CLM-005 (Ambiguous Match)**: Candidate record IDs and contract context
  - **CLM-006 (Unknown Item)**: Item number, contract, claimed price
  - **CLM-007 (Contract Expired)**: Date guidance
  - **Informational warnings**: Master/committed record IDs where available

### "If Approved" Commit Consequence Column (New)
- Replaces the Description column in the summary row with a clear commit-consequence label:
  - CLM-001: "Update price $X.XX → $Y.YY"
  - CLM-003: "Add item to contract plan"
  - CLM-006: "Create new item + record"
  - CLM-004: "Contract not found — manual review"
  - Warnings: "Informational — no master data change"
- Full description moved into the expanded detail panel

### Issues API Enrichment
- `getRunIssues()` now joins claim row data via separate query + Map (same pattern as CSV export)
- No schema changes — uses existing `claimRowId` FK on `reconciliation_issues`
- Added to response: `claimRow` object with `rowNumber`, `contractNumber`, `planCode`, `itemNumber`, `deviatedPrice`, `quantity`, `claimedAmount`, `transactionDate`, `endUserCode`, `endUserName`, `distributorOrderNumber`, `matchedRecordId`

### Tests
- 204 tests across 13 files — all passing, TypeScript clean, lint clean

---

## 2026-03-17 — Reconciliation Outcomes + Run Summary + Export

### Reconciliation Run Summary (New)
- **Durable commit summary** — commit outcomes (`recordsCreated`, `recordsSuperseded`, `recordsUpdated`, `itemsCreated`, `confirmed`, `rejected`, `dismissed`, `deferred`) are now persisted on the run via `commitSummary` JSONB field
- **Run Outcome panel** — committed runs display a persistent, richly formatted summary showing distributor, claim period, resolution breakdown, and master data changes
- Previously the commit summary was ephemeral React state — now it survives page refresh and run re-selection

### Reconciliation Export (New)
- `GET /api/export/reconciliation-run/[id]` — CSV export of a reconciliation run
- Metadata header rows: distributor, claim period, status, run by, claim file, timing
- Summary counts: total claim lines, validated, exceptions, resolution breakdown, commit outcomes
- Issue table: exception code, severity, category, description, suggested action, resolution, resolution note, resolver, contract/plan/item identifiers, claimed price, master/committed record IDs
- Export button in review panel header and runs table (for committed runs)

### Reconciliation UI Improvements
- Committed runs now show the Run Outcome panel instead of just a one-line "Committed" label
- Export CSV button available in the exception review panel header for runs in review, reviewed, or committed status
- Close button now also clears ephemeral commit result state

### Record Detail Actions (New)
- `/records/[id]` now supports Edit, Supersede, Expire, and Cancel — same actions available in the Records table
- **Shared action-availability helper** (`src/lib/records/record-actions.ts`) — single source of truth for which actions are valid per status, used by both detail page and table
- Records table `getRowActions()` refactored to use the shared helper
- Post-action behavior: Edit/Expire/Cancel → stay on page and refresh. Supersede → redirect to new replacement record (`/records/[newId]`)
- SupersedeModal now accepts optional `onSuccess` callback for post-save navigation

### Schema Change
- Added `commitSummary Json?` to `ReconciliationRun` model — persists the commit outcome summary at commit time

### Data Model Limits (Documented)
- `approvedAmount` and `rejectedAmount` fields on `reconciliation_runs` are defined but **never populated** — monetary totals are not yet available
- `claimedAmount` on `ClaimRow` is nullable and depends on distributor column mapping — not reliable for aggregate reporting
- Count-based summary only for now; monetary reporting deferred until data population is confirmed

### Tests
- 204 tests across 13 files (1 new test for commitSummary persistence)

---

## 2026-03-17 — Record Detail Page + Deep Links + Navigation

### Record Detail Page (New)
- `/records/[id]` — canonical single-record inspection surface
- Header card with core pricing info: rebate price, item, effective period, derived status
- Full contract context: distributor, end user, contract number, plan code, discount type
- **Supersession chain visualization** — linked timeline of predecessor → current → successor records
- Notes panel with inline add-note form
- Audit history timeline with field-level diffs
- Record metadata sidebar (created/updated by, timestamps)

### Deep Links (New + Updated)
- Records table: "View" action added to every row's action menu → navigates to detail page
- Contract detail: record item numbers are now clickable links to `/records/[id]`
- Reconciliation issues: "Record" and "Committed" context badges link to matched/committed records
- Removed `target="_blank"` from reconciliation context links (internal navigation)

### Contract Browse/Detail (Previous Session — Committed)
- `/contracts` list page with server-side filtering, pagination, cascading filter options
- `/contracts/[id]` detail page with plans, records, status breakdown
- Reconciliation issue context links for contracts (CLM-004 search badge)
- Sidebar updated: "Create Contract" → "Contracts"

### Bug Fixes
- Fixed pre-existing eslint `set-state-in-effect` warning in Records search input

---

## 2026-03-16 — Column Mapping Configuration + Contract Wizard + Reconciliation R1-R3

### Column Mapping Configuration (New)
- New `distributor_column_mappings` DB table for per-distributor, per-file-type mappings
- Settings → Column Mappings tab: upload sample file → detect columns → map to standard fields → save
- Auto-suggestion engine matches common header patterns to standard fields
- Supports claim, contract, and POS file types with configurable date formats
- Claim parser now reads from DB first with hardcoded FAS/MOTION fallback
- Reconciliation page links to Settings when distributor has no mapping configured

### Contract Setup Wizard (New)
- `/contracts/new` — Two-tab wizard: Upload File (primary) + Manual Entry
- Contract import service: Excel/CSV parsing with flexible header matching
- Auto-generated 6-digit contract numbers (starting from 100001)
- Preview before commit pattern — shows grouped contracts with line items
- Auto-creates end users and items if they don't exist in the system
- Sample contract file generator (`scripts/generate-sample-contract.ts`)

### Reconciliation Pipeline (Phases R1-R3)
- **R1 — Staging**: Upload claim file → parse via column mapping → store in claim_rows
- **R2 — Validation**: Compare claims against contract terms, generate CLM-001 through CLM-011 exceptions
- **R3 — Exception Resolution**: Individual + bulk approve/reject/dismiss, progress bar, auto-completion

### API Routes (New)
- `POST /api/contracts/import` — Contract file upload with preview mode
- `GET/POST /api/distributors/[id]/mappings` — Column mapping CRUD
- `POST /api/column-mappings/detect-headers` — Sample file header detection
- `GET /api/column-mappings` — List all configured mappings
- `GET /api/reconciliation/runs/[id]/issues` — List issues + progress for a run
- `PATCH /api/reconciliation/runs/[id]/issues/[issueId]` — Resolve individual issue
- `POST /api/reconciliation/runs/[id]/issues/bulk-resolve` — Bulk resolve issues

---

## 2026-03-13 — Focused Cleanup: Warnings, Redirect Safety, Docs, Tests

A second focused pass addressing validation warning surfacing, open-redirect hardening, documentation alignment, and integration test coverage.

### Warning Confirmation Flow
- API routes (`POST /api/records`, `PUT /api/records/[id]`) now return `{ needsConfirmation: true, warnings }` when validation passes but warnings exist and client hasn't set `confirmWarnings: true`
- `RecordModal` now shows warnings in an amber panel with "Save Anyway" and "Go Back and Edit" buttons
- Warnings displayed: retroactive start date, open-ended record, far-future end date, expired contract
- When errors and warnings both exist, errors shown in red and warnings shown in amber for context

### Callback Redirect Hardening
- Login page now validates `callbackUrl` — only allows paths starting with `/` (not `//`)
- Blocks absolute URLs (`https://evil.com`), protocol-relative URLs (`//evil.com`), `javascript:`, and `data:` schemes
- Falls back to `/` for any invalid callback URL

### Next 16 Middleware/Proxy Status
- Investigated: Next.js 16 already treats `middleware.ts` as proxy — build output shows `ƒ Proxy (Middleware)`
- No migration needed — both `npm run build` (Turbopack) and `npx next build --webpack` pass cleanly
- No deprecation warnings in build output

### Documentation Alignment
- Updated `docs/SYSTEM_DESIGN.md` — replaced "customer" with "distributor" throughout, added EndUser entity, updated routes/APIs/screens to match implementation, marked feature implementation status
- Updated `docs/IMPLEMENTATION_PLAN.md` — updated terminology, marked step completion status, updated file paths and component names to match reality, updated tech stack details

### Test Coverage Expanded
- Added 26 new tests across 4 test files (67 total, up from 41)
- `warning-flow.test.ts` — warning conditions, confirmWarnings flag semantics
- `callback-redirect.test.ts` — open redirect prevention, internal path allowance, edge cases
- `audit-semantics.test.ts` — soft-delete diff correctness, no-change detection, price change diffs, insert snapshots
- `auth-routing.test.ts` — API vs browser route classification, allow-list verification

### UI Truthfulness
- Verified: all UI elements are honest — no decorative controls, no unwired buttons
- Import page remains honestly marked "Coming Soon"
- Dashboard "Import Spreadsheet" link navigates to honest placeholder

### Distributor Detail Enhancements (from earlier in session)
- Added End User filter dropdown
- Added date range filter (From/To date pickers)
- Added per-contract metrics cards showing record count and latest updated date
- Added contract filter dropdown and search to Distributors list page

### Verification Results
- `npm run lint` — clean
- `npx tsc --noEmit` — clean
- `npm test` — 67 tests passed (6 test files)
- `npx prisma validate` — valid
- `npm run build` (Turbopack) — clean, all routes correct
- `npx next build --webpack` — clean

### Files Created
| File | Purpose |
|------|---------|
| `src/lib/__tests__/warning-flow.test.ts` | Tests for warning confirmation flow |
| `src/lib/__tests__/callback-redirect.test.ts` | Tests for open redirect prevention |
| `src/lib/__tests__/audit-semantics.test.ts` | Tests for soft-delete audit diffs |
| `src/lib/__tests__/auth-routing.test.ts` | Tests for auth route classification |

### Files Modified
| File | Change |
|------|--------|
| `src/app/api/records/route.ts` | Warning confirmation gate on POST |
| `src/app/api/records/[id]/route.ts` | Warning confirmation gate on PUT |
| `src/components/records/record-modal.tsx` | Warning display + Save Anyway / Go Back flow |
| `src/app/(auth)/login/page.tsx` | callbackUrl validation against open redirect |
| `src/components/records/distributor-detail-client.tsx` | End user filter, date filters, contract metrics |
| `src/app/(dashboard)/distributors/[id]/page.tsx` | Pass endUserOptions and contractMetrics |
| `src/components/distributors/distributors-page-client.tsx` | Search + contract filter for distributors list |
| `src/app/(dashboard)/distributors/page.tsx` | Pass allContracts and contractNumbers |
| `docs/SYSTEM_DESIGN.md` | Terminology alignment (customer → distributor) |
| `docs/IMPLEMENTATION_PLAN.md` | Terminology alignment + completion status |

### Known Remaining Items
- **Claim reconciliation pipeline** — placeholder page, not yet functional
- **Export functionality** — not implemented
- **Service/repository layer extraction** — business logic in route handlers works but should be extracted
- **Supersede/expire workflows** — UI-guided supersede not implemented

---

## 2026-03-16 — Reconciliation Reframe: Contract Setup + Claim Validation

A major documentation rewrite based on confirmed business process from sales. The rebate process has two distinct workflows: (1) contract setup/maintenance (what the RMS currently manages) and (2) monthly claim reconciliation against those stored terms.

### Business Process Confirmed
- Distributor requests special pricing → Brennan approves → contract record created with Contract ID, distributor, end user, items, deviated prices, dates
- Distributor sells items → submits monthly claim file → Brennan validates each claim line against contract terms → approve/adjust/reject

### Key Discoveries from Actual Fastenal Claim File
- Claims are at the **transaction/order line level** (not contract term summaries)
- Each line includes: Contract ID, Brennan part number, end user, transaction date, standard price, deviated price, quantity, extended discount owed
- **Pricing model**: Extended Discount Owed = (Standard Price - Deviated Price) x Quantity
- **`rebatePrice` in RMS = deviated price** (the approved contract price per unit) — **ASSUMPTION, pending confirmation**
- Two item numbers per line: distributor's internal SKU + Brennan's part number
- Contract ID is Brennan-assigned, 6-digit numeric
- Each distributor has its own file format — per-distributor column mapping needed

### Documents Rewritten
| Document | Change |
|----------|--------|
| `docs/RECONCILIATION_DESIGN.md` | Full rewrite — reframed around two-part workflow, claim validation against contracts, CLM-001–CLM-014 exception codes, pricing model, claim period tracking |
| `docs/CLAIM_FILE_SPEC.md` | Full rewrite (renamed from DISTRIBUTOR_TEMPLATE_SPEC.md) — per-distributor column mapping, Fastenal mapping confirmed from real sample, standard internal field set |
| `docs/NETSUITE_SAVED_SEARCH_SPEC.md` | Updated — reframed as claim verification, updated pricing terminology |
| `docs/SYSTEM_DESIGN.md` | Updated cross-references — template → claim, REC → CLM, template staging → claim staging |
| `docs/IMPLEMENTATION_PLAN.md` | Updated — milestones, risk areas, phases, file references all aligned to claim terminology |

### Exception Codes Renumbered
- Old: REC-001 through REC-011 (generic reconciliation)
- New: CLM-001 through CLM-014 (claim validation focused)
  - CLM-001–CLM-009: Claim-vs-contract exceptions (primary)
  - CLM-010–CLM-012: Claim-vs-sales exceptions (secondary, needs NetSuite)
  - CLM-013–CLM-014: Contract health exceptions (proactive)

### Business Questions Resolved
- **Monthly claim cadence** — confirmed
- **Claim file format** — per-distributor, not standard template
- **Contract numbers in claims** — yes (Fastenal includes them, 6-digit Brennan-assigned)

### Known Open Items
- Confirm `rebatePrice` = deviated price (strong assumption, pending explicit confirmation)
- Collect sample claim files from other distributors (MOTION, HSC, AIT, LGG, TIPCO)
- Consider renaming `rebatePrice` to `contractPrice` for clarity

---

## 2026-03-13 — Stabilization Pass: Auth, Validation, Correctness

A comprehensive review and fix pass addressing trust, auth, validation consistency, status correctness, and UI honesty.

### Critical Fixes

**Authentication & Authorization**
- Added `src/middleware.ts` — all dashboard routes now require authentication; unauthenticated users redirect to `/login`
- Added `src/lib/auth/session.ts` — `getSessionUser()` helper for API route handlers
- All API write endpoints (POST/PUT/DELETE) now check for authenticated session and `canEdit()` role permission
- Replaced 8 instances of hardcoded `userId: 1` with real session user ID across `src/app/api/records/route.ts` and `src/app/api/records/[id]/route.ts`
- Audit log entries now attribute changes to the actual logged-in user

**Validation on Update**
- `PUT /api/records/[id]` now calls `validateRecord()` with `mode: "update"` and `existingRecordId`
- Update path merges existing record values with incoming changes before validation
- Duplicate detection, overlap detection, date validation, and contract status checks now apply consistently to both create and update

**Status Derivation**
- Dashboard "Active Records" count changed from `WHERE status = 'active'` (stored) to date-based query: `startDate <= now AND (endDate IS NULL OR endDate >= now) AND supersededById IS NULL AND status NOT IN (draft, cancelled)`
- Dashboard "Expiring (30 days)" count uses same corrected active base query
- Distributors list page "Active Records" per-distributor now derives status via `deriveRecordStatus()` instead of counting all records
- API `GET /api/records?status=active` translates status filter to date-based WHERE clause

### High Fixes

**Audit Service Wired**
- API routes now use `auditService.logCreate()`, `auditService.logUpdate()`, `auditService.logDelete()` from `src/lib/audit/audit.service.ts`
- Replaced inline `prisma.auditLog.create()` calls — the existing audit service and diff utilities are now actually used

**UI Buttons & Filters Connected**
- Created `src/components/records/records-page-client.tsx` — client wrapper with working "New Record" button, "Edit" per-row, and filter dropdowns (distributor, status, search text)
- Created `src/components/records/distributor-detail-client.tsx` — same pattern for distributor detail page (filters by status, contract, plan, search)
- `RecordModal` component is now reachable from both Records and Distributor Detail pages
- Filter inputs have `onChange` handlers and actually filter displayed records

**Tests Added**
- Installed Vitest 4.1, created `vitest.config.ts`
- `src/lib/utils/__tests__/dates.test.ts` — 30 tests covering `deriveRecordStatus` (all priority paths, edge cases), `datesOverlap` (inclusive boundaries, null end dates), `stripTime`, `safeParseDate`, `isRetroactive`, `isFarFuture`, `isFarPast`
- `src/lib/audit/__tests__/diff.test.ts` — 11 tests covering `computeFieldDiff` (changed fields, excluded metadata, null handling, Date normalization) and `computeInsertSnapshot`
- Added `"test": "vitest run"` to package.json scripts

### Medium Fixes

**Dead Links & Placeholder Cleanup**
- Removed "Settings" from sidebar navigation (`src/components/layout/sidebar.tsx`) — no page exists
- Rewrote Import page (`src/app/(dashboard)/import/page.tsx`) to honestly say "Coming Soon" instead of showing fake interactive upload UI

**ESLint Fixed**
- Created `eslint.config.mjs` with flat config format for ESLint 9 + eslint-config-next
- Changed lint script from `next lint` (broken in Next.js 16 CLI) to `eslint src/`
- Installed `@eslint/eslintrc` and `@eslint/compat` dev dependencies

**Build Reliability**
- Added `export const dynamic = "force-dynamic"` to all 5 DB-backed pages:
  - `src/app/(dashboard)/page.tsx`
  - `src/app/(dashboard)/records/page.tsx`
  - `src/app/(dashboard)/distributors/page.tsx`
  - `src/app/(dashboard)/distributors/[id]/page.tsx`
  - `src/app/(dashboard)/audit/page.tsx`
- Build no longer attempts static generation for pages requiring database access

### Verification Results
- `npx tsc --noEmit` — clean (0 errors)
- `npm run lint` — clean (0 warnings)
- `npx vitest run` — 41 tests passed (2 test files)
- `npm run build` — clean, 14 routes, all DB pages dynamic
- `npx prisma validate` — schema valid

### Files Created
| File | Purpose |
|------|---------|
| `src/middleware.ts` | Auth middleware — redirects unauthenticated users |
| `src/lib/auth/session.ts` | `getSessionUser()` helper for API routes |
| `src/components/records/records-page-client.tsx` | Client wrapper with modal + filters for records page |
| `src/components/records/distributor-detail-client.tsx` | Client wrapper with modal + filters for distributor detail |
| `eslint.config.mjs` | ESLint 9 flat config |
| `vitest.config.ts` | Vitest configuration |
| `src/lib/utils/__tests__/dates.test.ts` | Unit tests for date utilities |
| `src/lib/audit/__tests__/diff.test.ts` | Unit tests for audit diff utilities |

### Files Modified
| File | Change |
|------|--------|
| `src/app/api/records/route.ts` | Auth, validation, audit service, date-based status filter |
| `src/app/api/records/[id]/route.ts` | Auth, validation on PUT, audit service |
| `src/app/api/distributors/route.ts` | Auth on POST |
| `src/app/(dashboard)/page.tsx` | Date-based active count, `dynamic` export |
| `src/app/(dashboard)/records/page.tsx` | Delegates to client component, `dynamic` export |
| `src/app/(dashboard)/distributors/page.tsx` | Derived active counts, `dynamic` export |
| `src/app/(dashboard)/distributors/[id]/page.tsx` | Delegates to client component, `dynamic` export |
| `src/app/(dashboard)/audit/page.tsx` | `dynamic` export |
| `src/app/(dashboard)/import/page.tsx` | Honest "Coming Soon" placeholder |
| `src/components/layout/sidebar.tsx` | Removed dead Settings link |
| `package.json` | lint/test scripts, vitest + eslint dev deps |

### Known Remaining Items
- **Import pipeline** — placeholder page, not yet functional
- **Export buttons** — visible on Records/Distributor pages but not wired
- **Full service/repository refactor** — reads still go through Prisma directly in server components and API GET handlers
- **Next.js 16 middleware deprecation** — build warns about `middleware` vs `proxy` convention; still functional
- **SYSTEM_DESIGN.md terminology** — still references "customer" where implemented schema uses "distributor"

---

## 2026-03-13 — Initial Build: Scaffolding through Working App

### What Was Built
- Full Next.js 16 project with TypeScript, Tailwind CSS v4, Prisma, PostgreSQL
- Docker Compose for PostgreSQL 15 + Redis 7
- Complete Prisma schema: distributors, end_users, contracts, rebate_plans, rebate_records, items, record_notes, audit_log, import_batches, users
- Seed data: 4 users, 6 distributors, 4 end users, 3 contracts, 3 plans, 8 items, 6 rebate records
- NextAuth.js v5 with Credentials provider and JWT strategy
- Login page with Brennan Industries branding
- Dashboard with summary metrics and recent activity
- Distributors list and detail pages
- Global records view
- Audit log page with field-level diffs
- Record create/edit modal component
- Central validation service with duplicate/overlap detection
- Audit service with field-level diff computation
- Status derivation from dates (deriveRecordStatus)
- Date overlap detection (datesOverlap)
- Role-based permission helpers (canEdit, canImport, etc.)
- Status badge component with color coding
- Sidebar navigation with inline SVG icons

### Key Design Decisions
- Used "Distributor" instead of "Customer" in schema based on user clarification that rebate IDs = distributor codes
- Added "EndUser" as separate entity (the actual customer the contract serves)
- Server components for all read pages (no API call overhead for reads)
- Client components only where interactivity is needed
- Brennan branding: Primary Blue #006293, Dark #003F78
