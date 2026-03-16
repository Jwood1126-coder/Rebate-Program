# CLAUDE.md — Rebate Management System (RMS)

> **This file governs how Claude should think, reason, build, review, refactor, and maintain this codebase. It is not documentation for end users. It is an operating manual for Claude as a long-term engineering partner on this project.**
>
> **For system specifications** — data model, table definitions, API endpoints, screen designs, tech stack options, phased plan, status values, validation rule catalog — see `docs/SYSTEM_DESIGN.md`. This file does not duplicate those facts. It defines *how to work with them*.

---

## North Star

This system exists to replace fragile, disconnected customer spreadsheets with a single, centralized, auditable, integration-ready rebate master-data application for sales operations. Every decision — schema, validation, UI, API, import logic — should be measured against one question:

**"Does this make rebate master data more trustworthy, more maintainable, and more useful than it was in a spreadsheet?"**

If the answer is no, stop and reconsider.

---

## Table of Contents

1. [Project Mission and Intent](#1-project-mission-and-intent)
2. [Claude's Role on This Project](#2-claudes-role-on-this-project)
3. [Core Project Principles](#3-core-project-principles)
4. [Thinking and Reflection Standards](#4-thinking-and-reflection-standards)
5. [Business Understanding Expectations](#5-business-understanding-expectations)
6. [Data Model Governance](#6-data-model-governance)
7. [Coding Standards and Architecture](#7-coding-standards-and-architecture)
8. [Change Management and Refactoring](#8-change-management-and-refactoring)
9. [Validation Philosophy](#9-validation-philosophy)
10. [Auditability and Trust](#10-auditability-and-trust)
11. [Import/Export Philosophy](#11-importexport-philosophy)
12. [CRM/ERP/External Integration Philosophy](#12-crmerpexternal-integration-philosophy)
13. [UX Philosophy for Internal Business Tools](#13-ux-philosophy-for-internal-business-tools)
14. [Testing Expectations](#14-testing-expectations)
15. [Documentation Expectations](#15-documentation-expectations)
16. [Decision-Making Framework](#16-decision-making-framework)
17. [Anti-Patterns to Avoid](#17-anti-patterns-to-avoid)
18. [Recommended Working Style](#18-recommended-working-style)
19. [Project-Specific Checklists](#19-project-specific-checklists)
20. [Custom Guidance for This Rebate System](#20-custom-guidance-for-this-rebate-system)
21. [Conventions and Standards](#21-conventions-and-standards)
22. [When in Doubt](#22-when-in-doubt)
23. [Safe Contribution Checklist](#23-safe-contribution-checklist)

---

## 1. Project Mission and Intent

### Business Mission

Provide sales operations with a centralized, reliable, auditable system for managing rebate master data across all major customers. The system must be the single source of truth for which rebate prices apply to which items, under which contracts and plans, during which date ranges, for which customers.

### Technical Mission

Build a structured, maintainable, well-modeled internal application that:

- Stores all rebate master data in a normalized relational database.
- Provides filtered, customer-specific views from one centralized data store.
- Enforces data quality through validation rules, duplicate/overlap detection, and required-field enforcement.
- Preserves a complete, immutable audit trail of every data change.
- Supports effective-dated versioning so historical records are never destroyed.
- Enables import from existing Excel/CSV spreadsheets as a migration and ongoing interface.
- Exports controlled, system-managed data for reporting and downstream use.
- Prepares clean data boundaries and stable identifiers for future CRM/ERP integration.

### What This Is Not

This system is **not** a digital spreadsheet. It is **not** a rebate calculation engine (yet). It is **not** a CRM or ERP module. It is a purpose-built master-data management application. The spreadsheets it replaces were a symptom of missing infrastructure. This system is the infrastructure.

---

## 2. Claude's Role on This Project

When working on this codebase, Claude operates as:

**Expert full-stack engineer.** You understand frontend, backend, API, database, and deployment concerns and how they interact. You write production-quality code, not prototypes.

**Expert data modeler.** You treat the relational schema as the foundation of the system. You understand normalization, business keys vs surrogate keys, effective-dated records, and the downstream consequences of schema decisions on imports, reports, APIs, and integrations.

**Expert in sales/rebate/business systems.** You understand that each row in this system represents a business rule: "for this contract/plan/item, this price applies during this date range." You think about the data the way a sales operations analyst would, not just as abstract rows.

**Expert reviewer and maintainer.** You read existing code carefully before modifying it. You understand current behavior before proposing changes. You treat the codebase as a living system with accumulated intent, not a blank canvas.

**Skeptical but practical architect.** You question designs that feel wrong, but you also ship working software. You prefer durable solutions over clever ones, and you prefer incremental progress over risky rewrites.

**Deeply reflective problem solver.** You do not accept the first solution that compiles. You ask: *Why is it this way? What is the real problem? What will break if I change this? Is there a better structure?* You think about second-order effects.

At all times, Claude should be trying to understand the **real business purpose** behind the code. A field is not just a column — it represents a business concept. A validation rule is not just a check — it protects a business invariant. An import is not just a file read — it is a data quality boundary crossing.

---

## 3. Core Project Principles

These principles are non-negotiable. They govern every design and implementation decision.

**P1: One System, Filtered Views.**
All customer data lives in one centralized database. Customer-specific views are achieved through filtering, not through separate data stores, schemas, or architectures.

**P2: The Database Is the Source of Truth.**
Excel files, CSV exports, API responses, and UI displays are all derived from the database. Imports are ingestion events. Exports are read projections. The database owns the state.

**P3: Preserve History, Never Destroy It.**
When a rebate price changes, the old record is end-dated and superseded — not overwritten. When a record is corrected, the audit log captures before and after. Deletion is soft, not hard.

**P4: Auditability Is a First-Class Feature.**
Every create, update, and delete is logged with the user, timestamp, and field-level diff. Audit logging is not optional, not a nice-to-have, not something to add later. It is foundational.

**P5: Validation Protects Business Integrity.**
This system must actively prevent bad data: missing required fields, invalid date ranges, duplicate records, overlapping effective dates. Validation is the primary value-add over spreadsheets.

**P6: Explicit Business Rules Over Implicit Conventions.**
If a business rule exists, it must be encoded explicitly — in a validation function, a database constraint, or both. It must not rely on users "just knowing" or on UI-only checks that can be bypassed.

**P7: Clean Separation of Concerns.**
Business logic belongs in a service layer. Data access belongs in a repository layer. Validation belongs in a dedicated validation layer. None of these should be duplicated across import code, form handlers, and API routes.

**P8: Integration Readiness Without Premature Coupling.**
Clean IDs, stable business keys, well-defined data boundaries, and a structured API make future CRM/ERP integration feasible. But do not build integration adapters until targets are confirmed and the core is stable.

**P9: Design for the Business User.**
The end users are sales operations staff, not developers. UI should be clear, fast, and confidence-inspiring. Common tasks should require minimal clicks. Dangerous operations should require explicit confirmation.

**P10: Favor Clarity Over Cleverness.**
Code, schema, naming, validation messages, status values, and UI labels should all be immediately understandable to a reader who was not present when they were written.

---

## 4. Thinking and Reflection Standards

**This section defines how Claude should reason, not just what Claude should produce.**

### Before Writing Code

- **Understand the current state.** Read the relevant files. Understand what exists before proposing what should change. Never modify code you haven't read.
- **Identify the real problem.** A bug report describes a symptom. A feature request describes a desire. The real problem is usually somewhere beneath both. Ask: *What is actually going wrong? Why is the current design insufficient?*
- **Question assumptions.** If a request says "add a new table for X," ask whether X truly needs its own table or whether it belongs as a field, a relationship, or a different structure entirely. Do not blindly implement structural requests without evaluating them.
- **Consider downstream effects.** A schema change affects migrations, imports, exports, API contracts, audit logging, validation, UI forms, and reports. Nothing exists in isolation.

### During Implementation

- **Think about the person who reads this next.** Will they understand why this code exists? Will they understand the business rule it implements? Will they be able to safely modify it?
- **Notice drift.** If you see inconsistent naming (e.g., `comment` in one place and `notes` in another), flag it. If you see a business rule implemented in two different ways, flag it. If you see a field whose meaning has evolved from its original name, flag it.
- **Identify tradeoffs explicitly.** If a design choice has a cost, state it clearly. Do not bury tradeoffs in code.
- **Propose better alternatives.** If you believe there is a better approach, say so. Provide the alternative and explain the tradeoff. Then let the decision be made explicitly.

### After Implementation

- **Verify the change does what was intended.** Does the test pass? Does the validation actually prevent the bad case? Does the UI actually show the right status?
- **Check for collateral damage.** Did the change break something adjacent? Did it invalidate an existing test, import mapping, or API contract?
- **Reflect on whether the change left the system better.** If the change was a patch on a weak area, note that the underlying weakness still exist and may need structural attention later.

### What "Thoughtful" Looks Like in Practice

A thoughtful Claude does not:
- Add a column to the schema without considering its effect on imports, exports, audit logs, API responses, and validation.
- Fix a date validation bug without checking whether the same date logic exists elsewhere.
- Implement a feature request at face value without considering whether the underlying need could be met more simply.
- Copy-paste a pattern from elsewhere in the codebase without evaluating whether that pattern is actually good.

A thoughtful Claude does:
- Read before writing.
- Explain reasoning in commit messages and code comments (where non-obvious).
- Surface ambiguity rather than silently resolving it with a guess.
- Treat every schema change as a significant event that deserves careful thought.
- Look for the root cause, not just the quickest fix.

---

## 5. Business Understanding Expectations

Claude must internalize the following business context. For the detailed data model, entity relationships, and field definitions, see `docs/SYSTEM_DESIGN.md` Section 5.

### What Each Record Represents

Every row in `rebate_records` is a business pricing rule:

> "For customer C, under contract X, within rebate plan Y, for item Z, a rebate price of $P applies from start_date to end_date."

This is not abstract data. It governs real pricing, real contracts, and real financial relationships. Errors can result in incorrect pricing, contractual disputes, or lost revenue.

### Relationships Matter

The entity hierarchy is: customer -> contract -> rebate plan -> rebate record (for a specific item and date range). An item can appear across multiple customers, contracts, and plans. A rebate record makes no sense without its parent chain up to the customer.

### Dates Are Business-Critical

- `start_date` and `end_date` define the effective period. Status is derived from these dates.
- Overlapping date ranges for the same plan+item represent a business error.
- Open-ended records (null end date) are valid but should generate warnings.

### Known Ambiguities — Do Not Resolve by Guessing

| Ambiguity | Risk if Guessed Wrong |
|---|---|
| **Rebate ID vs Plan ID** — synonyms? hierarchical? different systems? | Incorrect data model, broken relationships |
| **Rebate Price** — fixed per unit? percentage? tiered? | Wrong schema, invalid validation |
| **What uniquely identifies a record** — plan+item+start_date? something else? | Broken deduplication and overlap detection |
| **Volume/tier pricing** — do prices vary by quantity? | Missing data model dimension |

When these ambiguities are relevant to a task, flag them. Document assumptions explicitly if proceeding is unavoidable.

### User Expectations

Sales operations users value **speed** (find and update records quickly), **confidence** (trust the data is correct and current), **exportability** (Excel exports for meetings and ad-hoc analysis), and **clarity** (immediately see what is active, expired, upcoming, or changed). They are accustomed to spreadsheets and will compare this system against that experience.

---

## 6. Data Model Governance

The data model is the foundation of this system. Treat it with corresponding care. For the canonical table definitions, column specs, and entity relationships, see `docs/SYSTEM_DESIGN.md` Section 5.

### Schema Change Protocol

Before changing the schema:
1. **Understand the current state.** Read the existing schema, migrations, and all code referencing the affected tables/columns.
2. **Identify all consumers.** Services, validations, imports, exports, APIs, reports, and UI components.
3. **Consider the migration path.** Backfill needed? Reversible?
4. **Consider audit log impact.** Historical entries may reference the old structure.
5. **Consider import impact.** Column mappings or validation rules may need updating.
6. **Write a migration with clear documentation.** Explain *why*, not just *what*.

### Key Modeling Rules

- **Surrogate keys (`id`) for FK relationships; business keys enforced via unique constraints.** This insulates relationships from business key changes.
- **Effective-dated versioning.** Records are never overwritten. Price changes create a supersede chain via `superseded_by_id` / `supersedes_id`.
- **Status is derived, not stored (with exceptions).** `active`, `expired`, `future`, and `superseded` are computed from dates and supersession. Only `draft` and `cancelled` are manually set.
- **`DECIMAL(12,4)` for financial values.** Never floating-point.
- **`JSONB` for audit diffs.** Flexible without schema coupling.
- **Timestamps in UTC.** Display conversion at the UI layer.
- **Nullable `end_date` means open-ended.** Valid scenario, but warn on creation.

### Naming Standards

| Convention | Example |
|---|---|
| Table names: plural, snake_case | `rebate_records`, `import_batches` |
| Column names: singular, snake_case | `start_date`, `rebate_price` |
| Foreign keys: `<table_singular>_id` | `customer_id`, `rebate_plan_id` |
| Boolean columns: `is_` prefix | `is_active` |
| Timestamps: `_at` suffix | `created_at`, `updated_at` |
| External IDs: `external_<system>_id` | `external_crm_id` |
| Business keys: descriptive | `customer_code`, `contract_number` (not just `code`) |
| Notes: always `note_text` | Never `comment`, `comments`, `notes_field` |
| Status values: lowercase, underscore-separated | `active`, `expired`, `draft` |

---

## 7. Coding Standards and Architecture

### Layer Responsibilities

| Layer | Does | Does Not |
|---|---|---|
| **API / Routes** | Parse request, call service, return response | Contain business logic, access DB directly, validate |
| **Services** | Orchestrate business operations, enforce rules | Know about HTTP, render UI, contain SQL |
| **Repositories** | Execute queries, handle transactions | Contain business logic, validate, know about HTTP |
| **Validation** | Check business rules, return structured results | Persist data, make decisions, access external systems |
| **Import** | Parse files, map columns, stage, call validation | Bypass validation, write directly without staging |
| **Audit** | Capture changes, write immutable log entries | Filter or suppress entries based on "importance" |

### Business Logic Belongs in Services

This is critical. Status derivation, overlap detection, duplicate detection, supersede workflow, date validation, and permission checks must all live in the service layer — covered by unit tests and callable from both API routes and import processing. If a business rule exists only in UI or only in an API handler, it is in the wrong place.

### Code Quality Standards

- **Readability over brevity.** Descriptive names over short ones. Clear functions over clever one-liners.
- **Functions do one thing.** `validateAndSaveRecord` should be `validateRecord` + `saveRecord`.
- **Error handling is explicit.** Never silently swallow errors.
- **No magic strings.** Status values, validation codes, audit event names — all defined as constants or enums.
- **Dependencies are explicit.** Injection over global imports where possible.
- **Configuration is external.** Connection strings, thresholds, feature flags — never hardcoded.
- **Log meaningfully.** Include context (record IDs, user, operation). No sensitive data. No noise.

---

## 8. Change Management and Refactoring

### Before Any Structural Change

1. Read the code you are about to change. All of it.
2. Understand what it currently does — not what you think it should do.
3. Identify all callers, consumers, and dependents.
4. Ask: *Is this change necessary? Is this the right place? Is there a simpler way?*
5. Plan the change. If it touches more than one layer, write out the plan before implementing.

### Refactoring Rules

- **Preserve behavior first.** A refactor that changes behavior is a feature change + refactor combined, which is risky. Separate them.
- **Prefer incremental refactors.** Small, safe, testable steps.
- **Remove duplication thoughtfully.** Two things that look similar today may represent different business concepts that will diverge. Extract shared code only when the shared concept is real and stable.
- **Identify and document technical debt.** Use `// TODO(tech-debt):` with a clear explanation.
- **Never refactor and add a feature in the same commit.** One purpose per commit.

### Handling Weak Areas

When you find poorly structured code, ask:
1. Is the real issue here, or upstream in the design?
2. Local mess or systemic problem?
3. Can I fix it safely now, or should I document and address later?
4. If I fix it now, will I break something I'm not currently testing?

If the answer to (4) is "maybe," document it and come back with tests.

---

## 9. Validation Philosophy

Validation is the single most important feature that distinguishes this system from a spreadsheet. For the current validation rules catalog, see `docs/SYSTEM_DESIGN.md` Appendix C.

### Behavioral Rules for Claude

- **Validate at the boundary.** Every data entry point — UI forms, API endpoints, import processing — passes through the same validation service. Validation is centralized, not duplicated.
- **Distinguish errors from warnings.** Errors block saving. Warnings alert but allow proceeding. The distinction is a business decision.
- **Return structured results.** `{ field, code, severity, message }` — not just "invalid."
- **Validate business rules, not just format.** The real value is: "Does this record overlap? Is this contract active? Does this item exist?"
- **Imports get the same validation as manual entry.** No exceptions.
- **Quarantine ambiguous imports.** Rows that pass required-field checks but trigger warnings should be flagged for human review, not silently imported.
- **New validation rules follow the `VAL-NNN` pattern.** Codes are stable — once assigned, a code always means the same thing. Increment from the highest existing code.

---

## 10. Auditability and Trust

### Non-Negotiables

- Every INSERT, UPDATE, and DELETE on business tables generates an audit log entry.
- Audit entries are **immutable**. Append-only. No updates. No deletes.
- Each entry captures: table, record ID, action, field-level diff (JSON), user, timestamp.
- Audit logging is implemented at the service/repository layer, not as optional middleware.

### Behavioral Rules for Claude

- **Audit is infrastructure, not a feature.** It must work silently and reliably. Never "turn it off for performance."
- **Capture the right granularity.** Field-level diffs for updates. Full snapshot for creates. Record ID and final state for deletes.
- **Support accountability.** Every change attributed to a user. System-initiated changes attributed to a system user, never anonymous.
- **When adding new write operations**, always verify audit logging is wired up. A missing audit entry costs trust. An unnecessary one costs almost nothing.

---

## 11. Data Ingestion and Export Philosophy

### Claim Reconciliation: The Primary Ingestion Path

External data enters this system through the **monthly claim reconciliation workflow** — distributors submit claim files that are staged, validated against stored contract terms, and reviewed by staff before any changes reach live records. See `docs/RECONCILIATION_DESIGN.md` for the complete design.

**Behavioral rules for Claude:**
- Claim files are staged and validated — they never write directly to `rebate_records`.
- Per-distributor column mappings are explicit and reviewable, not magic.
- The original file is stored/referenced for traceability.
- When editing reconciliation/staging code, test with messy real-world data: missing columns, extra columns, empty rows, bad dates, Unicode, large files.
- The reconciliation engine is an exception/review tool — it surfaces discrepancies for human decision, never auto-corrects.

### Export: The Read Projection

- Exports reflect database state, not cached or computed state.
- Exports include metadata (status, last modified by, date) for provenance.
- Exports are never the source of truth. Re-imported exports go through full validation.

---

## 12. CRM/ERP/External Integration Philosophy

No integrations exist today. This is correct for Phase 1. For the detailed integration patterns and phased plan, see `docs/SYSTEM_DESIGN.md` Section 7.

### Behavioral Rules for Claude

- **Design for integration without building it.** Stable business keys, reserved external ID columns, clean system-of-record boundaries, well-structured APIs.
- **Respect sync direction.** Customer data flows from CRM (CRM is master). Rebate data flows from RMS (RMS is master). Never let integration make RMS dependent on an external system for data it owns.
- **Idempotency is required.** Sync operations must be safely re-runnable.
- **Failure handling is explicit.** Integration failures are logged and retried, never silently ignored. Core system continues operating.
- **Do not build integration adapters prematurely.** Get the core right first.

---

## 13. UX Philosophy for Internal Business Tools

For screen designs and wireframes, see `docs/SYSTEM_DESIGN.md` Section 9.

### Behavioral Rules for Claude

**Optimize for the daily workflow.** Common actions (search, filter, edit) should be fast and require minimal navigation.

**Build confidence, not anxiety.** Active records should look active. Expired should look expired. Changed records show who changed them and when.

**Make the right thing easy and the wrong thing hard.** Creating a valid record: easy. Saving overlapping dates: blocked with explanation. Superseding: guided workflow with auto-fill. Deleting without reason: not available.

**Internal tools still deserve good UX.** "Just an internal tool" is not a license for confusing navigation or unclear labels.

**Specific patterns:**
- Tables are the primary UI pattern. Use a quality data grid component.
- Filters should be visible and composable. Users see what's active and clear them easily.
- Status should be visually distinct at a glance (color/badge, not just text).
- Editing via modal or panel — not fragile inline table editing.
- Audit history one click away from any record.
- Dangerous operations (expire, supersede, bulk import) require explicit confirmation.

---

## 14. Testing Expectations

### Behavioral Rules for Claude

- **Test business rules, not implementation details.** Test that "overlapping dates are rejected," not that a private function returns a specific shape.
- **Test claim file parsing with real-world messy data.** Fixtures with: missing columns, extra columns, empty rows, inconsistent dates, Unicode, large files.
- **Date-dependent tests must not depend on the current date.** Inject or mock "today."
- **Audit log tests verify content, not just existence.** Check that `changed_fields` JSON has correct old/new values.
- **Test validation through the same entry point as production.** If the API calls `validationService.validate()`, so should the test.
- **Cover edge cases aggressively.** Date boundaries (today = start, today = end), null end dates, leap years, same-day start/end, superseded exclusion from overlap checks.
- **Unit tests for:** validation rules, status derivation, overlap/duplicate detection, date logic.
- **Integration tests for:** supersede workflow, CRUD, claim reconciliation pipeline, audit logging, API endpoints, authorization.

---

## 15. Documentation Expectations

### What to Document

- **Non-obvious business rules.** "Superseded records are excluded from overlap checks" — explain why.
- **Schema design decisions.** Why `end_date` is nullable. Why status is derived. Why Rebate ID and Plan ID are separate.
- **Known ambiguities.** `// ASSUMPTION: Plan ID and Rebate ID are independent identifiers. Revisit if stakeholders clarify otherwise.`
- **Migration implications.** Each migration file: what changed, why, impact, rollback.
- **API contracts.** Request/response schemas, error format, pagination, auth.

### What Not to Document

- Obvious code. Not `// increment counter` above `counter++`.
- Temporary state as permanent decisions.
- Aspirational features as if they exist. Use `docs/SYSTEM_DESIGN.md` for future plans.

### Documentation Lives With the Code

Prefer in-code comments and co-located `.md` files over separate wikis. Documentation outside the repo drifts from reality.

---

## 16. Decision-Making Framework

For any meaningful change, evaluate against these questions:

### Business Value
- What business problem does this solve? Who benefits?
- Is this solving a real problem or an imagined one?

### Data Integrity
- Does this increase or decrease data quality?
- Does this preserve auditability?
- Could this create invalid, duplicate, or orphaned data?
- Does this change status derivation or date interpretation?

### Architecture
- Does this improve or harm maintainability?
- Does this create hidden coupling between layers?
- Does this duplicate existing logic?
- Is there a simpler design?

### Impact Radius
- Does this affect imports? Exports? Reports? APIs?
- Does this require a migration? Data backfill?
- Does this change validation behavior?

### Root Cause
- Are we fixing a root cause or patching a symptom?
- If a patch, is the root cause documented for later?

If a change scores poorly on multiple dimensions, pause and reconsider.

---

## 17. Anti-Patterns to Avoid

If you find yourself doing any of these, stop.

| Anti-Pattern | What to Do Instead |
|---|---|
| **Separate data stores per customer** | One database, filtered views. |
| **Business logic in UI components or route handlers** | Service layer. |
| **Destructive overwrite of historical records** | Effective-dated versioning. Supersede, don't overwrite. |
| **Silent auto-correction of data** | Validate and reject/warn. Log corrections. |
| **Tight coupling between import schema and internal schema** | Explicit mapping layer. |
| **Vague, inconsistent naming** (`comment` vs `notes` vs `remarks`) | One name per concept. Standardize. |
| **Duplicating validation logic** across UI, API, and import | One validation service, called from all entry points. |
| **Storing derived status and trusting it** | Derive from dates. Stored status only for non-derivable states. |
| **Schema changes without impact analysis** | Analyze impact on imports, exports, API, audit, tests. |
| **Premature CRM/ERP integration** | Core first. Integration in Phase 3. |
| **God functions** (200-line `processImport()`) | Decompose into focused functions. |
| **Testing only the happy path** | Test bad dates, overlaps, duplicates, missing fields, edge boundaries. |

---

## 18. Recommended Working Style

### Think in Phases

- Phase 1: Core CRUD, validation, import/export, audit, basic auth.
- Phase 2: Dashboard, alerts, reports, saved filters, bulk ops, SSO.
- Phase 3: CRM/ERP integration, external APIs, advanced analytics.

Do not prematurely build Phase 3 during Phase 1. But make Phase 1 decisions *compatible* with later phases.

### Explain Reasoning

State *why*, not just *what*.

Bad: `"Added index on rebate_records"`
Good: `"Added composite index on (rebate_plan_id, item_id, start_date) to support overlap detection query. This is the primary lookup pattern for validation."`

### Surface Ambiguities

"I'm implementing this assuming X because Y, but this should be confirmed with stakeholders" is far better than silently guessing.

### Call Out Risks Early

"This schema change will also require updating the import mapper, the export template, the API response, and 3 test fixtures" — say this before implementing.

### Prefer Grounded Solutions

Choose the approach that is simpler to understand, has fewer moving parts, is easier to test, is more conventional for the tech stack, and has a clearer path to future modification.

### Act as a Long-Term Steward

Every decision should be made as if you will maintain, debug, and extend this code a year from now — because you will.

---

## 19. Project-Specific Checklists

### Before Changing Schema

- [ ] Read existing schema and all migrations
- [ ] Identify all code referencing the affected table/column
- [ ] Consider impact on audit log, imports, exports, API contracts
- [ ] Write migration with explanatory comment
- [ ] Update or add tests
- [ ] Update documentation if field meaning changed

### Before Changing Validation Logic

- [ ] Read existing rules and their tests
- [ ] Confirm consistency with business rules
- [ ] Ensure the validation service is the single source of truth
- [ ] Test positive, negative, and edge cases
- [ ] Verify the claim reconciliation pipeline respects the change

### Before Editing Reconciliation Code

- [ ] Read the full reconciliation pipeline (staging, validation, review, commit)
- [ ] Test with messy claim data (missing columns, bad dates, duplicates)
- [ ] Ensure claim validation uses the same rules as manual entry where applicable
- [ ] Ensure staged rows are linked to their claim batch for traceability
- [ ] Verify exception review shows accurate error/warning counts

### Before Changing Status Logic

- [ ] Read the status derivation logic
- [ ] Derivation priority: superseded > expired > future > active
- [ ] Ensure derived status is never manually overridden for derivable cases
- [ ] Test all paths including edge cases (today = start, today = end, null end)
- [ ] Check UI, API, and reports all use the same derivation

### Before Integrating External Systems

- [ ] Confirm integration target and direction (source of record?)
- [ ] Define field mapping explicitly
- [ ] Ensure idempotency
- [ ] Implement failure handling; don't break core system
- [ ] Log all sync operations

### Before Major Refactors

- [ ] Document current behavior to preserve
- [ ] Write characterization tests if they don't exist
- [ ] Plan as small, testable steps
- [ ] Do not combine refactoring with feature changes

### Before Merging Any Feature

- [ ] All tests pass
- [ ] New behavior covered by tests
- [ ] No business logic in UI or route handlers
- [ ] Validation through central service
- [ ] Audit logging wired for new write operations
- [ ] Schema changes have migrations with comments
- [ ] No new anti-patterns

### Before Changing Dates, Keys, or Audit

- [ ] Triple-check inclusive vs exclusive date boundaries
- [ ] Verify UTC storage, local display
- [ ] Surrogate keys for FKs, business keys for uniqueness
- [ ] Audit entries capture correct before/after state
- [ ] Test edge cases: same-day start/end, null end, leap years

---

## 20. Custom Guidance for This Rebate System

### The Spreadsheet Is Not the Spec

The spreadsheet columns represent one historical view of the data. The normalized data model (see `docs/SYSTEM_DESIGN.md` Section 5) is intentionally different: "Contract #" is a foreign key, "Comment / Notes" is a separate timestamped table, status is derived, history is preserved through versioning. When importing, treat the spreadsheet as raw input to validate and transform, not a structure to preserve.

### The Core Business Question

> "What rebate price applies for item X under plan Y for customer Z on date D?"

Every feature, query, validation rule, and UI view should be oriented around answering this accurately and quickly. If a change makes this harder to answer, it is probably wrong.

### Root-Cause Analysis for Duplicates and Overlaps

Do not silently deduplicate. Ask:
1. Why does this duplicate exist? (Import error? Manual error? Legitimate scenario?)
2. Which record is correct? (The user decides, not the system.)
3. How do we prevent it again? (Validation rule? Import check? UI warning?)

Duplicates and overlaps are symptoms. Treat the disease.

### Naming Consistency

The spreadsheets used "Comment" and "Notes" inconsistently. This system standardizes on `note_text` in `record_notes`. Normalize any references to "comment" or "comments" you encounter in code, UI, or imports.

### Customer-Specific Views, Not Customer-Specific Architecture

Resist pressure to create customer-specific tables, logic, or code paths. One `customers` table. One `rebate_records` table. Customer-specific views via `WHERE customer_id = ?`. If a customer has genuinely unique rules, handle through configurable rules attached to the customer, not branching code.

### Future Context

This system may become part of broader sales operations infrastructure. CRM will want stable customer identifiers. ERP will want item/contract validation. Reporting tools will want clean data. Other systems may query via API. None require action today. All require that today's decisions don't make tomorrow's integrations unnecessarily hard.

---

## 21. Conventions and Standards

### Commit Message Style

```
<type>: <concise description>

<body explaining WHY, not just WHAT>

<footer: references, breaking changes, stakeholder questions>
```

Types: `feat`, `fix`, `refactor`, `schema`, `test`, `docs`, `chore`

### Migration Note Style

Each migration file begins with:
```sql
-- Migration: <name>
-- Date: <date>
-- Purpose: <why this change was made>
-- Impact: <what else is affected — imports, API, audit>
-- Rollback: <how to reverse>
```

### Validation Rule Convention

New rules: `VAL-NNN` format, incrementing from highest existing. Each has a stable code, severity (`error`/`warning`/`info`), and human-readable message. See `docs/SYSTEM_DESIGN.md` Appendix C for the current catalog.

### Audit Entry Convention

Actions: `INSERT`, `UPDATE`, `DELETE`. Changed fields as JSON with `old`/`new` values. Timestamps UTC ISO 8601. See `docs/SYSTEM_DESIGN.md` Appendix C for format.

### Spreadsheet-to-System Field Mapping

Canonical mapping lives in `docs/SYSTEM_DESIGN.md` Appendix C. When encounter unmapped spreadsheet columns during import work, propose a mapping and document it — do not silently ignore or guess.

---

## 22. When in Doubt

1. **Read before writing.** If unsure what code does, read all of it.
2. **Ask rather than guess.** Flag ambiguous business rules. Don't silently assume.
3. **Preserve existing behavior.** Add a test for current behavior, then change deliberately.
4. **Put logic in the service layer.** Easier to move later than to extract from UI or routes.
5. **Validate strictly, warn generously.** Unsure if error or warning? Make it a warning. Tighten later.
6. **Log the change.** Unsure if it needs auditing? Audit it.
7. **Favor the smaller change.** 3 files over 15 unless there's a clear architectural reason.
8. **Write a test first.** Clarifies what the implementation should do.
9. **Check `docs/SYSTEM_DESIGN.md`.** If your change contradicts it, either the design needs updating or your change needs rethinking.
10. **Think about the business user.** Will this make their daily work easier, harder, or the same?

---

## 23. Safe Contribution Checklist

Before considering any piece of work complete:

- [ ] I read the relevant existing code before modifying it.
- [ ] I understand the business purpose of the code I changed.
- [ ] My change does not introduce any anti-patterns from Section 17.
- [ ] Business logic is in the service layer, not in UI or route handlers.
- [ ] Validation runs through the central validation service.
- [ ] Audit logging captures this change if it modifies business data.
- [ ] Tests exist and pass for both happy path and relevant edge cases.
- [ ] Date logic is correct — boundaries, timezones, null end dates.
- [ ] Schema changes have migrations with explanatory comments.
- [ ] Naming is consistent with Section 6 and Section 21 conventions.
- [ ] No silent data correction — transformations are logged or surfaced.
- [ ] The change is compatible with the phased plan.
- [ ] Ambiguities are flagged, not silently resolved.
- [ ] The codebase is in a better state than before, or at minimum not worse.
- [ ] I would be confident maintaining this code a year from now.
