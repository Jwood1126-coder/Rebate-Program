// POS file parsing service.
// Parses distributor POS (Point of Sale) reports using per-distributor column mappings,
// maps to standard internal POS fields, and runs format-level validation.
//
// POS data is supplementary — it is cross-referenced against claims but does not
// prove sales definitively (it comes from the distributor, not an independent source).

import * as XLSX from 'xlsx';
import { parse as parseDate, isValid as isValidDate } from 'date-fns';
import type {
  ColumnMapping,
  StandardPosRow,
  PosParseResult,
  ParseError,
  PosFieldName,
} from './types';
import { REQUIRED_POS_FIELDS } from './types';

/**
 * Parse a POS file buffer using the provided column mapping.
 */
export function parsePosFile(
  fileBuffer: Buffer,
  fileName: string,
  mapping: ColumnMapping,
  periodStart: Date,
  periodEnd: Date
): PosParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Parse file
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

  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: null,
    raw: false,
  });

  if (rawRows.length === 0) {
    return makeErrorResult('File contains no data rows.');
  }

  // Validate mapped columns exist
  const fileHeaders = Object.keys(rawRows[0]);
  const missingColumns = validateMappedColumnsExist(mapping, fileHeaders);
  if (missingColumns.length > 0) {
    return makeErrorResult(
      `Missing required columns in file: ${missingColumns.join(', ')}. ` +
      `Expected columns based on ${mapping.name} mapping.`
    );
  }

  // Parse rows
  const rows: StandardPosRow[] = [];
  let validCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    const rowNumber = i + 2;

    if (isEmptyRow(rawRow)) continue;

    const parsed = mapAndValidateRow(rawRow, rowNumber, mapping, periodStart, periodEnd);
    rows.push(parsed);

    if (parsed.parseErrors.some(e => e.severity === 'error')) {
      errorCount++;
    } else {
      validCount++;
    }
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('No valid data rows found after parsing.');
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
// Row-level parsing
// ---------------------------------------------------------------------------

function mapAndValidateRow(
  rawRow: Record<string, unknown>,
  rowNumber: number,
  mapping: ColumnMapping,
  periodStart: Date,
  periodEnd: Date
): StandardPosRow {
  const parseErrors: ParseError[] = [];

  const get = (field: PosFieldName): string | null => {
    // POS mappings use the same ColumnMapping structure
    const colName = (mapping.mappings as Record<string, string>)[field];
    if (!colName) return null;
    const val = rawRow[colName];
    if (val === null || val === undefined) return null;
    return String(val).trim() || null;
  };

  const itemNumberStr = get('itemNumber');
  const quantityStr = get('quantity');
  const transactionDateStr = get('transactionDate');
  const sellPriceStr = get('sellPrice');
  const endUserCode = get('endUserCode');
  const endUserName = get('endUserName');
  const orderNumber = get('orderNumber');
  const distributorItemNumber = get('distributorItemNumber');
  const extendedAmountStr = get('extendedAmount');
  const shipToCity = get('shipToCity');
  const shipToState = get('shipToState');

  // Validate required
  if (!itemNumberStr) parseErrors.push({ field: 'itemNumber', message: 'Part number is required.', severity: 'error' });
  if (!quantityStr) parseErrors.push({ field: 'quantity', message: 'Quantity is required.', severity: 'error' });
  if (!transactionDateStr) parseErrors.push({ field: 'transactionDate', message: 'Transaction date is required.', severity: 'error' });

  // Parse date
  const transactionDate = transactionDateStr ? parseTransactionDate(transactionDateStr, mapping.dateFormat) : null;
  if (transactionDateStr && !transactionDate) {
    parseErrors.push({ field: 'transactionDate', message: `Invalid date: "${transactionDateStr}".`, severity: 'error' });
  }

  // Date within period check (warning only)
  if (transactionDate) {
    if (transactionDate < periodStart || transactionDate > periodEnd) {
      parseErrors.push({
        field: 'transactionDate',
        message: `Date outside POS period (${formatDateSimple(periodStart)} - ${formatDateSimple(periodEnd)}).`,
        severity: 'warning',
      });
    }
  }

  // Parse numbers
  const quantity = quantityStr ? parseNumber(quantityStr) : null;
  if (quantityStr && quantity === null) {
    parseErrors.push({ field: 'quantity', message: `Invalid quantity: "${quantityStr}".`, severity: 'error' });
  }

  const sellPrice = sellPriceStr ? parseNumber(sellPriceStr) : null;
  const extendedAmount = extendedAmountStr ? parseNumber(extendedAmountStr) : null;

  return {
    rowNumber,
    itemNumber: itemNumberStr,
    quantity,
    transactionDate,
    sellPrice,
    endUserCode,
    endUserName,
    orderNumber,
    distributorItemNumber,
    extendedAmount,
    shipToCity,
    shipToState,
    rawData: rawRow as Record<string, unknown>,
    parseErrors,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTransactionDate(value: string, format: string): Date | null {
  const parsed = parseDate(value, format, new Date());
  if (isValidDate(parsed)) return parsed;

  const fallbacks = ['M/d/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'M-d-yyyy'];
  for (const fmt of fallbacks) {
    const fallback = parseDate(value, fmt, new Date());
    if (isValidDate(fallback)) return fallback;
  }
  return null;
}

function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[$,]/g, '').trim();
  const num = Number(cleaned);
  if (isNaN(num)) return null;
  return num;
}

function isEmptyRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every(v => v === null || v === undefined || String(v).trim() === '');
}

function validateMappedColumnsExist(mapping: ColumnMapping, fileHeaders: string[]): string[] {
  const missing: string[] = [];
  const headerSet = new Set(fileHeaders.map(h => h.trim()));

  for (const field of REQUIRED_POS_FIELDS) {
    const colName = (mapping.mappings as Record<string, string>)[field];
    if (!colName) {
      missing.push(`${field} (no mapping configured)`);
    } else if (!headerSet.has(colName)) {
      missing.push(`"${colName}" (mapped from ${field})`);
    }
  }
  return missing;
}

function formatDateSimple(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function makeErrorResult(message: string): PosParseResult {
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
