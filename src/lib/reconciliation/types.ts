// Reconciliation types — claim file parsing, validation, and review.
// See docs/CLAIM_FILE_SPEC.md for the standard field set.
// See docs/RECONCILIATION_DESIGN.md Section 6 for exception categories.

// ---------------------------------------------------------------------------
// Standard claim row — the internal representation after column mapping
// ---------------------------------------------------------------------------
export interface StandardClaimRow {
  rowNumber: number;
  // Required fields
  contractNumber: string | null;
  itemNumber: string | null; // Brennan part number ("Vendor Item")
  transactionDate: Date | null;
  deviatedPrice: number | null;
  quantity: number | null;
  // Strongly recommended
  claimedAmount: number | null;
  standardPrice: number | null;
  endUserCode: string | null;
  endUserName: string | null;
  // Optional
  planCode: string | null;
  distributorItemNumber: string | null;
  distributorOrderNumber: string | null;
  itemDescription: string | null;
  vendorName: string | null;
  // Raw data for traceability
  rawData: Record<string, unknown>;
  // Parse-level errors for this row
  parseErrors: ParseError[];
}

export interface ParseError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

// ---------------------------------------------------------------------------
// Column mapping — per-distributor configuration
// ---------------------------------------------------------------------------
export interface ColumnMapping {
  distributorCode: string;
  name: string;
  // Maps standard field name → distributor's column header
  mappings: Partial<Record<StandardFieldName, string>>;
  dateFormat: string;
  skipColumns?: string[];
}

export type StandardFieldName =
  | 'contractNumber'
  | 'itemNumber'
  | 'transactionDate'
  | 'deviatedPrice'
  | 'quantity'
  | 'claimedAmount'
  | 'standardPrice'
  | 'endUserCode'
  | 'endUserName'
  | 'planCode'
  | 'distributorItemNumber'
  | 'distributorOrderNumber'
  | 'itemDescription'
  | 'vendorName';

// Fields that must be non-empty for a row to be valid
export const REQUIRED_FIELDS: StandardFieldName[] = [
  'contractNumber',
  'itemNumber',
  'transactionDate',
  'deviatedPrice',
  'quantity',
];

// ---------------------------------------------------------------------------
// Parse result — output of the parsing service
// ---------------------------------------------------------------------------
export interface ClaimParseResult {
  success: boolean;
  rows: StandardClaimRow[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  warnings: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Standard POS row — the internal representation after column mapping
// ---------------------------------------------------------------------------
// POS (Point of Sale) reports come from the distributor and provide
// supplementary sales data for cross-referencing against claims.
// POS data is informational — it does not prove sales definitively.
export interface StandardPosRow {
  rowNumber: number;
  // Core matching fields
  itemNumber: string | null;             // Brennan/vendor part number
  quantity: number | null;               // Quantity sold
  transactionDate: Date | null;          // Ship/sale date
  sellPrice: number | null;              // Price actually charged
  // Cross-reference fields
  endUserCode: string | null;            // Ship-to customer
  endUserName: string | null;            // Ship-to name
  orderNumber: string | null;            // Invoice/order number
  // Context fields
  distributorItemNumber: string | null;  // Distributor's internal part number
  extendedAmount: number | null;         // Total line amount (qty × price)
  shipToCity: string | null;             // Shipping location
  shipToState: string | null;
  // Raw data for traceability
  rawData: Record<string, unknown>;
  parseErrors: ParseError[];
}

export type PosFieldName =
  | 'itemNumber'
  | 'quantity'
  | 'transactionDate'
  | 'sellPrice'
  | 'endUserCode'
  | 'endUserName'
  | 'orderNumber'
  | 'distributorItemNumber'
  | 'extendedAmount'
  | 'shipToCity'
  | 'shipToState';

export const REQUIRED_POS_FIELDS: PosFieldName[] = [
  'itemNumber',
  'quantity',
  'transactionDate',
];

export interface PosParseResult {
  success: boolean;
  rows: StandardPosRow[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  warnings: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Exception codes — from RECONCILIATION_DESIGN.md Section 6
// ---------------------------------------------------------------------------
export const EXCEPTION_CODES = {
  CLM_001: 'CLM-001', // Price Mismatch
  CLM_002: 'CLM-002', // Date Out of Range
  CLM_003: 'CLM-003', // Item Not in Contract
  CLM_004: 'CLM-004', // Contract Not Found
  CLM_005: 'CLM-005', // Plan Not Found
  CLM_006: 'CLM-006', // Unknown Item
  CLM_007: 'CLM-007', // Contract Expired
  CLM_008: 'CLM-008', // End User Mismatch
  CLM_009: 'CLM-009', // Duplicate Claim Line
  CLM_010: 'CLM-010', // No Matching POS Transaction
  CLM_011: 'CLM-011', // POS Quantity Mismatch
  CLM_012: 'CLM-012', // POS Price Mismatch
} as const;

export type ExceptionCode = typeof EXCEPTION_CODES[keyof typeof EXCEPTION_CODES];

// ---------------------------------------------------------------------------
// Price tolerance constants
//
// PRICE_MATCH_TOLERANCE: used when comparing a single claimed price against
// the contract price (CLM-001) or POS price (CLM-012). $0.01 accounts for
// minor rounding in unit prices.
//
// ARITHMETIC_TOLERANCE: used when checking that claimedAmount ≈
// (standardPrice - deviatedPrice) × quantity. $0.02 because multiplication
// can compound small per-unit rounding differences.
// ---------------------------------------------------------------------------
export const PRICE_MATCH_TOLERANCE = 0.01;
export const ARITHMETIC_TOLERANCE = 0.02;

// ---------------------------------------------------------------------------
// Reconciliation run statuses
// ---------------------------------------------------------------------------
export const RUN_STATUSES = {
  DRAFT: 'draft',
  STAGED: 'staged',
  RUNNING: 'running',
  REVIEW: 'review',
  REVIEWED: 'reviewed',   // All exceptions resolved, ready for commit
  COMMITTED: 'committed', // Approved claims written to master data
  COMPLETED: 'completed', // Legacy — treated same as reviewed
  CANCELLED: 'cancelled',
} as const;

export const CLAIM_BATCH_STATUSES = {
  UPLOADED: 'uploaded',
  PARSED: 'parsed',
  STAGED: 'staged',
  ERROR: 'error',
} as const;

// ---------------------------------------------------------------------------
// UI-facing reconciliation types — used by review panel, run workflow, etc.
// ---------------------------------------------------------------------------

export interface ClaimRowData {
  rowNumber: number;
  contractNumber: string | null;
  planCode: string | null;
  itemNumber: string | null;
  deviatedPrice: number | null;
  quantity: number | null;
  claimedAmount: number | null;
  transactionDate: string | null;
  endUserCode: string | null;
  endUserName: string | null;
  distributorOrderNumber: string | null;
  matchedRecordId: number | null;
}

export interface DbIssue {
  id: number;
  reconciliationRunId: number;
  code: string;
  severity: string;
  category: string;
  description: string;
  claimRowId: number | null;
  masterRecordId: number | null;
  committedRecordId: number | null;
  suggestedAction: string;
  suggestedData: Record<string, unknown> | null;
  resolution: string | null;
  resolutionNote: string | null;
  resolvedById: number | null;
  resolvedAt: string | null;
  resolvedBy: { displayName: string } | null;
  claimRow: ClaimRowData | null;
}

export interface RunProgress {
  totalIssues: number;
  resolvedCount: number;
  pendingCount: number;
  allResolved: boolean;
  breakdown: Record<string, number>;
}

export interface CommitSummaryData {
  totalApproved: number;
  recordsCreated: number;
  recordsSuperseded: number;
  recordsUpdated: number;
  itemsCreated: number;
  confirmed: number;
  rejected: number;
  dismissed: number;
  deferred: number;
}

export interface ReconciliationRunSummary {
  id: number;
  status: string;
  totalClaimLines: number;
  exceptionCount: number;
  claimPeriodStart: string;
  claimPeriodEnd: string;
  completedAt: string | null;
  commitSummary: CommitSummaryData | null;
  distributor: { code: string; name: string };
}
