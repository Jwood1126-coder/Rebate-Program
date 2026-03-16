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
  CLM_010: 'CLM-010', // No Sales Record (NetSuite)
  CLM_011: 'CLM-011', // Quantity Mismatch (NetSuite)
} as const;

export type ExceptionCode = typeof EXCEPTION_CODES[keyof typeof EXCEPTION_CODES];

// ---------------------------------------------------------------------------
// Reconciliation run statuses
// ---------------------------------------------------------------------------
export const RUN_STATUSES = {
  DRAFT: 'draft',
  STAGED: 'staged',
  RUNNING: 'running',
  REVIEW: 'review',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export const CLAIM_BATCH_STATUSES = {
  UPLOADED: 'uploaded',
  PARSED: 'parsed',
  STAGED: 'staged',
  ERROR: 'error',
} as const;
