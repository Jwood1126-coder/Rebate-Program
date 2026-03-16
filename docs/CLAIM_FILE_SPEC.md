# Claim File Specification — Rebate Management System

> **This document defines the standard field set for distributor rebate claim files** and the known column mappings for each distributor. The system uses this spec to parse, validate, and stage claim files during reconciliation.
>
> For reconciliation workflow context, see `RECONCILIATION_DESIGN.md`. For system specs, see `SYSTEM_DESIGN.md`.

---

## 1. Purpose

Distributors submit **monthly claim files** listing the items they sold at deviated (contract) prices, along with the rebate amount they believe they earned. Each file covers one month's transactions for one distributor.

The system must:
- Parse each distributor's claim file using a per-distributor column mapping
- Map distributor-specific columns to a **standard internal field set**
- Validate format and stage rows for claim validation against contract terms

**Key difference from the old template spec:** Distributors do NOT submit a standard template. Each distributor has their own file format. The system maps each format to a standard internal representation.

---

## 2. File Format Requirements

| Requirement | Value |
|-------------|-------|
| **File types accepted** | `.xlsx` (preferred), `.csv` |
| **Encoding** | UTF-8 (for CSV) |
| **Header row** | Required — first row must contain column headers |
| **One distributor per file** | Required — the target distributor is **selected by the user during upload** |
| **One claim period per file** | Expected — each file covers one month. The claim period (month/year) is **selected by the user during upload**. |
| **Maximum file size** | TBD — recommend 10MB initial limit |
| **Sheet name (Excel)** | First sheet is used. Additional sheets ignored. |
| **Empty rows** | Skipped during parsing |
| **Trailing whitespace** | Trimmed automatically |

---

## 3. Standard Internal Field Set

Regardless of the distributor's file format, every claim line is mapped to this standard set of fields during parsing. Fields marked **Required** must be present after column mapping; rows missing required values are flagged as parse errors.

### Required Fields

| Standard Field | Data Type | Description | Validation |
|----------------|-----------|-------------|------------|
| `contractNumber` | Text | Brennan's 6-digit contract number | Non-empty. Must match a contract for this distributor. |
| `itemNumber` | Text | Brennan's part number (the "Vendor Item") | Non-empty. Compared against `items.itemNumber`. |
| `transactionDate` | Date | The date of the sale | Valid date. Must fall within the selected claim period. |
| `deviatedPrice` | Decimal | The contract/deviated price per unit claimed | Positive number. Compared against `rebatePrice` in contract terms. |
| `quantity` | Decimal | Quantity sold | Positive number. |

### Strongly Recommended Fields

| Standard Field | Data Type | Description | Notes |
|----------------|-----------|-------------|-------|
| `claimedAmount` | Decimal | Extended discount owed — the total rebate claimed for this line | Should equal `(standardPrice - deviatedPrice) x quantity`. If present, system can cross-check arithmetic. |
| `standardPrice` | Decimal | Current vendor price (standard/list price) | Stored for reference and arithmetic verification. |
| `endUserCode` | Text | End user code (distributor's internal) | Used for matching against contract end user. |
| `endUserName` | Text | End user name | Display context during review. |

### Optional Fields

| Standard Field | Data Type | Description | Notes |
|----------------|-----------|-------------|-------|
| `planCode` | Text | Rebate plan code within the contract | If present, enables precise plan-level matching. If absent, system matches at contract + item level. |
| `distributorItemNumber` | Text | Distributor's internal SKU/item number | Stored for reference. Not used for matching. |
| `distributorOrderNumber` | Text | Distributor's PO or order number | Stored for reference and traceability. |
| `itemDescription` | Text | Item description | Display context. |
| `vendorName` | Text | Vendor name (should be "Brennan" or similar) | Cross-validation: if present and doesn't match Brennan, flag as error. |
| `notes` | Text | Free-text notes | Stored in staging for reference. |

---

## 4. Known Distributor Mappings

### 4.1 Fastenal (FAS)

**Source:** Actual claim file sample (February 2026).

| Fastenal Column | Standard Field | Notes |
|-----------------|---------------|-------|
| `Contract ID` | `contractNumber` | Brennan's 6-digit contract number |
| `Vendor Item` | `itemNumber` | Brennan's part number — **primary matching key** |
| `Date` | `transactionDate` | Format: M/D/YYYY |
| `Deviated Price` | `deviatedPrice` | Per-unit contract price |
| `QTY` | `quantity` | |
| `Extended Discount Owed` | `claimedAmount` | Total rebate for the line |
| `Current Vendor Price` | `standardPrice` | Brennan's standard/list price |
| `Customer` | `endUserCode` | Fastenal's internal customer code (e.g., MN0080097) |
| `Name` | `endUserName` | End user name (e.g., "MCNEILUS TRUCK AND MFG - DIRECTED BUY") |
| `Item` | `distributorItemNumber` | Fastenal's internal SKU (e.g., 04017578) |
| `Order no` | `distributorOrderNumber` | Fastenal's PO number |
| `Description` | `itemDescription` | |
| `Vendor` (column A) | `vendorName` | Always "BRENNAN INDUSTRIES, INC" |
| `Vendor` (column J) | *(ignored)* | Vendor code — not used |

**Date format:** `M/D/YYYY` (e.g., 2/27/2026)

**Arithmetic check:** `claimedAmount` should equal `(standardPrice - deviatedPrice) x quantity`

### 4.2 Other Distributors

Mappings for MOTION, HSC, AIT, LGG, TIPCO will be added as sample files are received. Each distributor will get a section in this document with their specific column mapping.

**Expected pattern:** Most distributors will include the same conceptual data (contract reference, item, quantity, prices, dates) but with different column names and possibly different column order. The mapping configuration translates each to the standard field set.

---

## 5. Row-Level Validation (Applied During Parsing)

| Rule | Severity | Description |
|------|----------|-------------|
| Required column mapped | Error | All required standard fields must have a mapped source column in the file. |
| Required value non-empty | Error | Required field values cannot be blank for any row. |
| `deviatedPrice` is positive number | Error | Must parse as a positive decimal. |
| `quantity` is positive number | Error | Must parse as a positive number. |
| `transactionDate` is valid date | Error | Must parse as a valid date. |
| `transactionDate` within claim period | Warning | Date should fall within the selected claim month. Dates outside the period are flagged. |
| Arithmetic check | Warning | If both `standardPrice` and `claimedAmount` are present: `claimedAmount` should equal `(standardPrice - deviatedPrice) x quantity`. Significant deviation flags a warning. |

---

## 6. File-Level Validation (Applied After Parsing)

| Rule | Severity | Description |
|------|----------|-------------|
| Header row present | Error | First row must contain recognizable column headers matching the distributor's mapping. |
| At least one data row | Error | File must contain at least one non-header, non-empty row. |
| No duplicate rows | Warning | Same contract + item + transaction date + quantity appearing multiple times. |
| Vendor cross-validation | Error | If a vendor name column is mapped and values don't match Brennan, the wrong file may have been uploaded. |

---

## 7. Per-Distributor Column Mapping Configuration

Each distributor needs a stored column mapping configuration that tells the system which file columns map to which standard fields. This configuration includes:

```json
{
  "distributorCode": "FAS",
  "name": "Fastenal Claim File",
  "mappings": {
    "contractNumber": "Contract ID",
    "itemNumber": "Vendor Item",
    "transactionDate": "Date",
    "deviatedPrice": "Deviated Price",
    "quantity": "QTY",
    "claimedAmount": "Extended Discount Owed",
    "standardPrice": "Current Vendor Price",
    "endUserCode": "Customer",
    "endUserName": "Name",
    "distributorItemNumber": "Item",
    "distributorOrderNumber": "Order no",
    "itemDescription": "Description",
    "vendorName": "Vendor"
  },
  "dateFormat": "M/D/YYYY",
  "skipColumns": ["Vendor (column J)"]
}
```

**Storage:** This configuration can start as a code-level constant (hardcoded per distributor) and later move to a database table if dynamic configuration is needed.

**Onboarding a new distributor:**
1. Receive a sample claim file
2. Define the column mapping
3. Add the mapping to this document and to the system configuration
4. Test parsing with the sample file
5. Validate with a real monthly claim

---

## 8. Examples

### Fastenal Claim Lines (From Actual Sample)

| Contract ID | Vendor Item | Date | Deviated Price | QTY | Extended Discount Owed | Current Vendor Price | Customer | Name |
|------------|-------------|------|---------------|-----|----------------------|---------------------|----------|------|
| 100884 | 6801-12-12-NWO-FG | 2/27/2026 | 2.7800 | 150 | $411.00 | 5.5200 | MN0080097 | MCNEILUS TRUCK AND MFG |
| 100884 | 6801-12-12-NWO-FG | 2/19/2026 | 2.7800 | 116 | $317.84 | 5.5200 | MN0080097 | MCNEILUS TRUCK AND MFG |
| 104291 | 6801-12-12-NWO-FG | 2/26/2026 | 4.0000 | 25 | $38.00 | 5.5200 | MN0450059 | YANMAR CE NA - RFID |

**Arithmetic verification:**
- Line 1: (5.52 - 2.78) x 150 = 2.74 x 150 = $411.00
- Line 2: (5.52 - 2.78) x 116 = 2.74 x 116 = $317.84
- Line 3: (5.52 - 4.00) x 25 = 1.52 x 25 = $38.00

**Key observation:** The same Brennan part number (6801-12-12-NWO-FG) appears under different contracts (100884, 104291) with different deviated prices ($2.78 vs $4.00) for different end users. This is why contract number is critical for matching — item number alone is ambiguous.

### What Claim Validation Checks Against These Lines

For line 1:
1. Contract 100884 exists for Fastenal? Yes/No
2. Item 6801-12-12-NWO-FG exists under a plan in contract 100884? Yes/No
3. Contract active on 2/27/2026? Yes/No
4. Stored `rebatePrice` for this contract + plan + item = 2.7800? Match / Mismatch (CLM-001)
5. End user matches contract's end user? Match / Mismatch (CLM-008)

---

## 9. Versioning

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-13 | Initial specification (as DISTRIBUTOR_TEMPLATE_SPEC.md — standard template format). |
| 2.0 | 2026-03-16 | **Major rewrite.** Renamed to CLAIM_FILE_SPEC.md. Reframed around actual claim file format based on Fastenal sample. Per-distributor column mapping replaces standard template. Claim fields reflect transaction-level data (quantity, prices, dates) rather than contract term summaries. |

---

## 10. Open Questions

| # | Question | Impact |
|---|----------|--------|
| C1 | **Do all distributors include a contract number in their claims?** Fastenal does. Others may not. | Without contract number, matching falls back to distributor + item only — less precise if same item appears under multiple contracts. |
| C2 | **Do any distributors include plan codes?** The Fastenal sample doesn't clearly show one. | Without plan code, matching is contract + item. May be ambiguous if contracts have multiple plans covering the same item. |
| C3 | **What date formats do other distributors use?** | Per-distributor date format configuration needed. |
| C4 | **Can the system trust the distributor's arithmetic?** Should `claimedAmount` be recomputed or accepted as-is? | Recommend: recompute and flag discrepancies as a warning. |
| C5 | **Are there multi-line claims for the same item?** e.g., same item sold on different dates or to different end users in the same month. | The Fastenal sample shows this (multiple lines for 6801-12-12-NWO-FG with different dates/end users). System must handle multiple claim lines per item per month. |
| C6 | **Is "Vendor Item" always the Brennan part number?** Or do some distributors use a different identifier? | Affects matching reliability. If some distributors don't include Brennan part numbers, a cross-reference table (distributor SKU to Brennan part #) may be needed. |
| C7 | **Are there claim files where a single line aggregates multiple transactions?** Or is every line a distinct sale? | Affects how quantities are validated against NetSuite. |
