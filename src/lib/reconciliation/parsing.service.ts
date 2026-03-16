// Claim file parsing service.
// Parses distributor claim files (Excel/CSV) using per-distributor column mappings,
// maps to standard internal fields, and runs format-level validation.
//
// See docs/CLAIM_FILE_SPEC.md for the standard field set and validation rules.
// See docs/RECONCILIATION_DESIGN.md Section 4.2 Step 1 for workflow context.

import * as XLSX from 'xlsx';
import { parse as parseDate, isValid as isValidDate } from 'date-fns';
import type {
  ColumnMapping,
  StandardClaimRow,
  ClaimParseResult,
  ParseError,
  StandardFieldName,
} from './types';
import { REQUIRED_FIELDS } from './types';

/**
 * Parse a claim file buffer using the provided column mapping.
 *
 * @param fileBuffer - The raw file content (Excel or CSV)
 * @param fileName - Original file name (used for format detection)
 * @param mapping - Per-distributor column mapping configuration
 * @param claimPeriodStart - First day of the claim month (for date validation)
 * @param claimPeriodEnd - Last day of the claim month (for date validation)
 * @returns Parsed result with rows, counts, and any file-level errors
 */
export function parseClaimFile(
  fileBuffer: Buffer,
  fileName: string,
  mapping: ColumnMapping,
  claimPeriodStart: Date,
  claimPeriodEnd: Date
): ClaimParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Parse the file into a worksheet
  let worksheet: XLSX.WorkSheet;
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return makeErrorResult('File contains no sheets.');
    }
    worksheet = workbook.Sheets[firstSheetName];
  } catch {
    return makeErrorResult(`Failed to parse file "${fileName}". Ensure it is a valid Excel (.xlsx) or CSV file.`);
  }

  // Convert to array of objects (header row → keys)
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: null,
    raw: false, // Return formatted strings for consistent parsing
  });

  if (rawRows.length === 0) {
    return makeErrorResult('File contains no data rows (only a header or empty).');
  }

  // Validate that required mapped columns exist in the file headers
  const fileHeaders = Object.keys(rawRows[0]);
  const missingColumns = validateMappedColumnsExist(mapping, fileHeaders);
  if (missingColumns.length > 0) {
    return makeErrorResult(
      `Missing required columns in file: ${missingColumns.join(', ')}. ` +
      `Expected columns based on ${mapping.name} mapping.`
    );
  }

  // Parse each row
  const rows: StandardClaimRow[] = [];
  let validCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    const rowNumber = i + 2; // +2: 1-indexed, skip header

    // Skip completely empty rows
    if (isEmptyRow(rawRow)) continue;

    const parsed = mapAndValidateRow(rawRow, rowNumber, mapping, claimPeriodStart, claimPeriodEnd);
    rows.push(parsed);

    if (parsed.parseErrors.some(e => e.severity === 'error')) {
      errorCount++;
    } else {
      validCount++;
    }
  }

  // File-level validation
  const vendorCheck = checkVendorConsistency(rows, mapping);
  if (vendorCheck) {
    errors.push(vendorCheck);
  }

  const duplicates = detectDuplicateRows(rows);
  if (duplicates > 0) {
    warnings.push(`${duplicates} potential duplicate rows detected (same contract + item + date + quantity).`);
  }

  return {
    success: errors.length === 0,
    rows,
    totalRows: rows.length,
    validRows: validCount,
    errorRows: errorCount,
    warnings,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Row-level parsing and validation
// ---------------------------------------------------------------------------

function mapAndValidateRow(
  rawRow: Record<string, unknown>,
  rowNumber: number,
  mapping: ColumnMapping,
  periodStart: Date,
  periodEnd: Date
): StandardClaimRow {
  const parseErrors: ParseError[] = [];

  // Map columns using the distributor's mapping
  const get = (field: StandardFieldName): string | null => {
    const colName = mapping.mappings[field];
    if (!colName) return null;
    const val = rawRow[colName];
    if (val === null || val === undefined) return null;
    return String(val).trim() || null;
  };

  // Parse individual fields
  const contractNumber = get('contractNumber');
  const itemNumber = get('itemNumber');
  const transactionDateStr = get('transactionDate');
  const deviatedPriceStr = get('deviatedPrice');
  const quantityStr = get('quantity');
  const claimedAmountStr = get('claimedAmount');
  const standardPriceStr = get('standardPrice');
  const endUserCode = get('endUserCode');
  const endUserName = get('endUserName');
  const planCode = get('planCode');
  const distributorItemNumber = get('distributorItemNumber');
  const distributorOrderNumber = get('distributorOrderNumber');
  const itemDescription = get('itemDescription');
  const vendorName = get('vendorName');

  // Validate required fields
  if (!contractNumber) parseErrors.push({ field: 'contractNumber', message: 'Contract number is required.', severity: 'error' });
  if (!itemNumber) parseErrors.push({ field: 'itemNumber', message: 'Item number (Brennan part #) is required.', severity: 'error' });
  if (!transactionDateStr) parseErrors.push({ field: 'transactionDate', message: 'Transaction date is required.', severity: 'error' });
  if (!deviatedPriceStr) parseErrors.push({ field: 'deviatedPrice', message: 'Deviated price is required.', severity: 'error' });
  if (!quantityStr) parseErrors.push({ field: 'quantity', message: 'Quantity is required.', severity: 'error' });

  // Parse date
  const transactionDate = transactionDateStr ? parseTransactionDate(transactionDateStr, mapping.dateFormat) : null;
  if (transactionDateStr && !transactionDate) {
    parseErrors.push({ field: 'transactionDate', message: `Invalid date: "${transactionDateStr}". Expected format: ${mapping.dateFormat}`, severity: 'error' });
  }

  // Validate date within claim period
  if (transactionDate) {
    if (transactionDate < periodStart || transactionDate > periodEnd) {
      parseErrors.push({
        field: 'transactionDate',
        message: `Date ${formatDateSimple(transactionDate)} is outside the claim period (${formatDateSimple(periodStart)} - ${formatDateSimple(periodEnd)}).`,
        severity: 'warning',
      });
    }
  }

  // Parse numbers
  const deviatedPrice = deviatedPriceStr ? parsePositiveNumber(deviatedPriceStr) : null;
  if (deviatedPriceStr && deviatedPrice === null) {
    parseErrors.push({ field: 'deviatedPrice', message: `Invalid deviated price: "${deviatedPriceStr}". Must be a positive number.`, severity: 'error' });
  }

  const quantity = quantityStr ? parsePositiveNumber(quantityStr) : null;
  if (quantityStr && quantity === null) {
    parseErrors.push({ field: 'quantity', message: `Invalid quantity: "${quantityStr}". Must be a positive number.`, severity: 'error' });
  }

  const standardPrice = standardPriceStr ? parsePositiveNumber(standardPriceStr) : null;
  const claimedAmount = claimedAmountStr ? parsePositiveNumber(claimedAmountStr) : null;

  // Arithmetic check: claimedAmount should ≈ (standardPrice - deviatedPrice) × quantity
  if (standardPrice !== null && deviatedPrice !== null && quantity !== null && claimedAmount !== null) {
    const expected = (standardPrice - deviatedPrice) * quantity;
    const tolerance = 0.02; // 2 cents tolerance for rounding
    if (Math.abs(claimedAmount - expected) > tolerance) {
      parseErrors.push({
        field: 'claimedAmount',
        message: `Arithmetic mismatch: claimed $${claimedAmount.toFixed(2)}, expected $${expected.toFixed(2)} = (${standardPrice.toFixed(4)} - ${deviatedPrice.toFixed(4)}) × ${quantity}.`,
        severity: 'warning',
      });
    }
  }

  return {
    rowNumber,
    contractNumber,
    itemNumber,
    transactionDate,
    deviatedPrice,
    quantity,
    claimedAmount,
    standardPrice,
    endUserCode,
    endUserName,
    planCode,
    distributorItemNumber,
    distributorOrderNumber,
    itemDescription,
    vendorName,
    rawData: rawRow as Record<string, unknown>,
    parseErrors,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTransactionDate(value: string, format: string): Date | null {
  // Try the configured format first
  const parsed = parseDate(value, format, new Date());
  if (isValidDate(parsed)) return parsed;

  // Fallback: try common formats
  const fallbacks = ['M/d/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'M-d-yyyy'];
  for (const fmt of fallbacks) {
    const fallback = parseDate(value, fmt, new Date());
    if (isValidDate(fallback)) return fallback;
  }

  return null;
}

function parsePositiveNumber(value: string): number | null {
  // Strip currency symbols and commas
  const cleaned = value.replace(/[$,]/g, '').trim();
  const num = Number(cleaned);
  if (isNaN(num) || num < 0) return null;
  return num;
}

function isEmptyRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every(v => v === null || v === undefined || String(v).trim() === '');
}

function validateMappedColumnsExist(mapping: ColumnMapping, fileHeaders: string[]): string[] {
  const missing: string[] = [];
  const headerSet = new Set(fileHeaders.map(h => h.trim()));

  for (const field of REQUIRED_FIELDS) {
    const colName = mapping.mappings[field];
    if (!colName) {
      missing.push(`${field} (no mapping configured)`);
    } else if (!headerSet.has(colName)) {
      missing.push(`"${colName}" (mapped from ${field})`);
    }
  }

  return missing;
}

function checkVendorConsistency(rows: StandardClaimRow[], mapping: ColumnMapping): string | null {
  if (!mapping.mappings.vendorName) return null;

  const nonBrennan = rows.filter(
    r => r.vendorName && !r.vendorName.toUpperCase().includes('BRENNAN')
  );

  if (nonBrennan.length > 0) {
    return `${nonBrennan.length} rows have a vendor name that doesn't match Brennan. This may be the wrong file.`;
  }
  return null;
}

function detectDuplicateRows(rows: StandardClaimRow[]): number {
  const seen = new Set<string>();
  let dupes = 0;

  for (const row of rows) {
    if (!row.contractNumber || !row.itemNumber || !row.transactionDate || !row.quantity) continue;
    const key = `${row.contractNumber}|${row.itemNumber}|${row.transactionDate.toISOString()}|${row.quantity}`;
    if (seen.has(key)) {
      dupes++;
    } else {
      seen.add(key);
    }
  }

  return dupes;
}

function formatDateSimple(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function makeErrorResult(message: string): ClaimParseResult {
  return {
    success: false,
    rows: [],
    totalRows: 0,
    validRows: 0,
    errorRows: 0,
    warnings: [],
    errors: [message],
  };
}
