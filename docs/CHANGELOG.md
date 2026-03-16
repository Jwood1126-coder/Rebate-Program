# Changelog — Rebate Management System

All notable changes to this project are documented in this file, grouped by session.

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
