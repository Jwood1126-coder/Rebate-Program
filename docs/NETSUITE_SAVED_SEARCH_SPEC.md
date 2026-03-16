# NetSuite Saved Search Export Specification

> **This document defines the expected field set for NetSuite sales data exports** used in the claim reconciliation workflow. The system ingests these exports to verify that distributor-claimed sales actually occurred and to cross-reference claim data against actual transaction records.
>
> For reconciliation workflow context, see `RECONCILIATION_DESIGN.md`. For claim file format, see `CLAIM_FILE_SPEC.md`.

---

## 1. Purpose

NetSuite saved search exports provide the **sales verification dimension** of the claim reconciliation workflow. When a distributor submits a monthly claim file, NetSuite data answers: "Did these sales actually happen?"

This data serves two purposes:
- **Claim verification** — cross-reference distributor claim lines against actual NetSuite transactions to confirm the sale occurred (CLM-010, CLM-011)
- **Contract health monitoring** — identify active contracts with no corresponding sales activity, or sales happening without contract coverage (CLM-013, CLM-014)

**Important constraint:** The NetSuite export provides sales transaction data. It does **not** contain rebate amounts or deviated prices. The unit sell price in NetSuite is the price the distributor charges the end user — this is fundamentally different from the deviated price (stored as `rebatePrice`) or the standard vendor price. See Section 5 for details.

---

## 2. File Format Requirements

| Requirement | Value |
|-------------|-------|
| **File types accepted** | `.xlsx`, `.csv` |
| **Encoding** | UTF-8 (for CSV) |
| **Header row** | Required |
| **Source** | NetSuite saved search export (manual download or scheduled export) |
| **Period scope** | Must be documented — the export should cover a defined date range |

---

## 3. Minimum Viable Field Set (Matching Only)

These fields are the **strict minimum** required for basic reconciliation matching — linking sales rows to master records by business key and date. Without these three fields, the export cannot be meaningfully compared.

| Field Name | NetSuite Source | Data Type | Purpose in Reconciliation |
|------------|----------------|-----------|---------------------------|
| `Transaction Date` | Transaction: Date | Date | Determines the time period for matching against rebate record effective dates. |
| `Customer Name` or `Customer Code` | Customer: Name / Customer: Internal ID | Text | Maps to `distributors.code` or `distributors.name`. This is the distributor in RMS terms. |
| `Item Number` | Item: Name / Item: Internal ID | Text | Maps to `items.itemNumber`. Primary matching key for item-level comparison. |

**Note:** `Quantity` is **not** required for matching. It is strongly recommended for analysis (see Section 4) but the core matching logic — "did a sale of this item happen for this distributor in this date range?" — only requires the three fields above.

---

## 4. Recommended Field Set

These additional fields significantly improve reconciliation quality and analysis depth.

### Matching Fields

Used to link sales rows to master records and claim lines.

| Field Name | NetSuite Source | Purpose |
|------------|----------------|---------|
| `Transaction Date` | Transaction: Date | **Required.** Time-based matching. |
| `Customer Name` | Customer: Company Name | **Required.** Distributor identification. |
| `Customer Code` | Customer: Internal ID or Entity ID | Preferred over name for reliable matching. |
| `Item Number` | Item: Name/Number | **Required.** Item matching. |
| `Item Description` | Item: Description | Display context during review. |

### Analysis Fields

Used to enrich exception context and support future analytics. **Not used for primary matching** but strongly recommended for useful reconciliation.

| Field Name | NetSuite Source | Purpose |
|------------|----------------|---------|
| `Quantity` | Transaction: Quantity | **Strongly recommended.** Volume analysis, threshold checks. Not required for matching but essential for meaningful activity analysis. |
| `Unit Sell Price` | Transaction: Rate or Amount / Quantity | **See Section 5 — NOT comparable to deviated price or standard price without a business rule.** |
| `Line Total` | Transaction: Amount | Total dollar value of the line. |
| `Transaction Type` | Transaction: Type | Distinguish invoices from credit memos, returns, etc. See Section 6. |
| `Transaction Number` | Transaction: Document Number | Reference for traceability. |
| `Product Code` / `Item Category` | Item: Class or Category | Cross-reference with `items.productCode`. |

### Ownership Fields

Used for future sales ownership and commission tracking. Not required for initial reconciliation.

| Field Name | NetSuite Source | Purpose |
|------------|----------------|---------|
| `Sales Rep` | Transaction: Sales Rep | Identifies the sales representative on the transaction. |
| `Territory` | Customer: Territory | Sales territory assignment. |
| `End User` / `Ship-To` | Transaction: Ship-To or custom field | May identify the end user for the transaction. Availability depends on NetSuite configuration. |
| `Contract Number` | Custom field (if available) | **See Section 7 — availability uncertain.** |

---

## 5. Sell Price vs Deviated Price vs Standard Price — Critical Distinction

**This is the most important caveat in this document.**

| Concept | Source | Meaning |
|---------|--------|---------|
| **Unit Sell Price** | NetSuite `Transaction: Rate` | The price the distributor charges the end user per unit. This is a sales figure. |
| **Deviated Price** (aka Contract Price) | RMS `rebate_records.rebatePrice` | The special contract price per unit that Brennan approved for this distributor/end user/item. Lower than standard price. |
| **Standard Price** (aka Current Vendor Price) | Claim file `Current Vendor Price` | The normal/list price Brennan charges the distributor. |
| **Rebate Amount** | Claim file `Extended Discount Owed` | `(Standard Price - Deviated Price) x Quantity` — the compensation Brennan owes the distributor. |

**The NetSuite sell price is none of these.** It is the price the distributor charges to the end user, which is set by the distributor and is not directly related to Brennan's pricing terms.

Possible relationships (all require stakeholder confirmation):
- Sell price bears no defined relationship to deviated price (most likely)
- Sell price may correlate with deviated price plus distributor margin
- There may be minimum resale price expectations under certain contracts

**Recommendation:** Do NOT implement sell price vs deviated price comparison (CLM-012) as a default exception rule. If this comparison is desired in the future, it requires:
1. An explicit business rule defining how the two prices relate
2. Stakeholder sign-off that the rule is correct
3. Configuration for any exceptions or edge cases

Until then, the sell price is stored in staging for **reference and analysis only** — not for automatic discrepancy detection.

---

## 6. Transaction Type Considerations

NetSuite exports may include multiple transaction types:

| Type | Handling |
|------|----------|
| **Invoice** | Standard sales transaction. Include in reconciliation. |
| **Credit Memo** | Return or adjustment. **Open question: should credits offset sales quantities?** |
| **Cash Sale** | Direct sale. Include in reconciliation (treated same as invoice). |
| **Sales Order** | Order, not yet invoiced. **Open question: include or exclude?** Typically exclude — only compare against actual invoices. |
| **Return Authorization** | Authorized return. **Open question: offset sales or ignore?** |

**Recommendation:** For Phase R3, include only Invoice and Cash Sale transaction types. Other types should be flagged and excluded by default, with a configurable option to include them later.

---

## 7. Open Questions

### Critical

| # | Question | Impact |
|---|----------|--------|
| N1 | **What period does the saved search cover?** A specific date range? Rolling 12 months? All time? | Determines whether "no sales activity" is meaningful for a given rebate record. A record may be valid even with no recent sales. |
| N2 | **Is the export cumulative or incremental?** Does each export contain all transactions in the period, or only new ones since the last export? | Affects how the system aggregates sales data across multiple uploads. |
| N3 | **Is a contract number available in NetSuite transactions?** Is it a standard field or a custom field? | Without contract number, matching is less precise (distributor + item only, without contract/plan context). This means the system cannot distinguish between the same item appearing under different contracts for the same distributor. |
| N4 | **How are distributors identified in NetSuite?** By name? By internal ID? By a custom code field? Does the NetSuite customer name match `distributors.name` or `distributors.code`? | Affects matching reliability. Ideally, a code or ID that can be mapped to `distributors.code`. |
| N5 | **How should credits and returns be handled?** Should they reduce the quantity for reconciliation purposes, or be tracked separately? | Affects quantity-based analysis and threshold rules. |

### High

| # | Question | Impact |
|---|----------|--------|
| N6 | **Is there a relationship between sell price and deviated price?** See Section 5. | Determines whether CLM-012 is ever implementable. |
| N7 | **What is the expected row count per export?** Hundreds? Thousands? Tens of thousands? | Affects parsing performance, staging table design, and whether background processing is needed. |
| N8 | **Are there multiple NetSuite subsidiaries or books?** Or is all sales data in one saved search? | Affects whether the system needs to handle multiple exports for the same period. |

### Medium

| # | Question | Impact |
|---|----------|--------|
| N9 | **Can we get a sample NetSuite export?** Even a sanitized one with fake data. | Having a real file shape would significantly improve the accuracy of this spec. |
| N10 | **Are there custom fields on NetSuite transactions** that are relevant to rebates? (e.g., rebate program, special pricing flag) | May provide additional matching or filtering context. |
| N11 | **Is the saved search run by a specific user or automated?** | Determines whether the export format is stable or may change when someone modifies the search. |

---

## 8. Recommended Saved Search Configuration

If the organization has control over the NetSuite saved search, the ideal configuration for reconciliation would be:

### Search Criteria
- **Transaction Type:** Invoice, Cash Sale (exclude orders, credit memos initially)
- **Date Range:** Configurable — ideally matching the reconciliation period
- **Customer:** Filter to distributor accounts relevant to the rebate program (or all, and filter during staging)

### Result Columns (In Order)
1. Transaction Date
2. Customer Code (Entity ID or custom field)
3. Customer Name
4. Item Number
5. Item Description
6. Quantity
7. Unit Sell Price (Rate)
8. Line Total (Amount)
9. Transaction Type
10. Transaction Number (Document Number)
11. Sales Rep (if available)
12. Contract Number (if available as custom field)

### Export Settings
- **Format:** CSV or Excel
- **Sort:** Transaction Date ascending
- **Headers:** Include column headers in first row

---

## 9. Versioning

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-13 | Initial specification — minimum and recommended field sets defined. |
| 1.1 | 2026-03-16 | Reframed purpose around claim verification (not generic comparison). Updated references from DISTRIBUTOR_TEMPLATE_SPEC to CLAIM_FILE_SPEC. Updated pricing terminology (deviated price). |

This spec will be refined once a real NetSuite export sample is available (see Q: N9).
