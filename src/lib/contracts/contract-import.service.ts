// Contract import service.
// Parses Excel/CSV files containing contract setup data and creates
// contracts, plans, and rebate records in a single transaction.
//
// Expected columns (flexible header matching):
//   Distributor Code | End User Code | End User Name | Plan Code | Discount Type |
//   Item Number | Open Net Price | Start Date | End Date | Description
//
// Rows are grouped by (distributor + end user) to create one contract each.
// Contract numbers are auto-generated (next available 6-digit number).

import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db/client';
import type { Prisma, PrismaClient } from '@prisma/client';
import { AUDIT_ACTIONS } from '@/lib/constants/statuses';
import { computeInsertSnapshot } from '@/lib/audit/diff';
import { deriveRecordStatus } from '@/lib/utils/dates';

// Transaction client type — excludes top-level connection/transaction methods
type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContractImportResult {
  success: boolean;
  contractId?: number;
  contractsCreated: number;
  plansCreated: number;
  recordsCreated: number;
  errors: string[];
  warnings: string[];
  preview?: ContractPreviewGroup[];
}

export interface ContractPreviewGroup {
  distributorCode: string;
  distributorName: string;
  endUserCode: string;
  endUserName: string;
  contractNumber: string;
  planCode: string;
  discountType: string;
  description: string;
  startDate: string;
  endDate: string;
  lineItems: {
    itemNumber: string;
    deviatedPrice: number;
    startDate: string;
    endDate: string;
  }[];
}

interface ParsedRow {
  rowNum: number;
  distributorCode: string;
  endUserCode: string;
  endUserName: string;
  planCode: string;
  discountType: string;
  itemNumber: string;
  deviatedPrice: number;
  startDate: string;
  endDate: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Column header matching (flexible, case-insensitive)
// ---------------------------------------------------------------------------

const HEADER_PATTERNS: Record<string, RegExp[]> = {
  distributorCode: [/distributor/i, /dist[\s._-]?code/i, /rebate[\s._-]?id/i],
  endUserCode: [/end[\s._-]?user[\s._-]?code/i, /eu[\s._-]?code/i, /customer[\s._-]?code/i],
  endUserName: [/end[\s._-]?user[\s._-]?name/i, /end[\s._-]?user$/i, /eu[\s._-]?name/i, /customer[\s._-]?name/i, /customer$/i],
  planCode: [/plan[\s._-]?code/i, /plan[\s._-]?id/i, /rebate[\s._-]?plan/i, /plan$/i],
  discountType: [/discount[\s._-]?type/i, /type$/i],
  itemNumber: [/item[\s._-]?number/i, /item[\s._-]?#/i, /part[\s._-]?number/i, /part[\s._-]?#/i, /sku/i, /item$/i],
  deviatedPrice: [/deviated[\s._-]?price/i, /rebate[\s._-]?price/i, /price$/i, /unit[\s._-]?price/i],
  startDate: [/start[\s._-]?date/i, /effective[\s._-]?date/i, /from[\s._-]?date/i, /start$/i],
  endDate: [/end[\s._-]?date/i, /expir/i, /to[\s._-]?date/i, /end$/i],
  description: [/description/i, /desc$/i, /notes/i, /comment/i],
};

function matchHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const [field, patterns] of Object.entries(HEADER_PATTERNS)) {
    for (const header of headers) {
      if (patterns.some(p => p.test(header.trim()))) {
        mapping[field] = header;
        break;
      }
    }
  }

  return mapping;
}

// ---------------------------------------------------------------------------
// Contract number generation (transaction-safe)
// ---------------------------------------------------------------------------

async function generateContractNumber(tx: TxClient): Promise<string> {
  const contracts = await tx.contract.findMany({
    select: { contractNumber: true },
    orderBy: { contractNumber: 'desc' },
    take: 1,
  });

  let nextNum = 100001;
  if (contracts.length > 0) {
    const highest = parseInt(contracts[0].contractNumber, 10);
    if (!isNaN(highest)) {
      nextNum = highest + 1;
    }
  }

  return String(nextNum);
}

/**
 * Write an audit INSERT entry inside a transaction.
 */
async function auditInTx(
  tx: TxClient,
  tableName: string,
  recordId: number,
  record: Record<string, unknown>,
  userId: number,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tableName,
      recordId,
      action: AUDIT_ACTIONS.INSERT,
      changedFields: computeInsertSnapshot(record) as unknown as Prisma.InputJsonValue,
      userId,
    },
  });
}

// ---------------------------------------------------------------------------
// Parse file
// ---------------------------------------------------------------------------

export function parseContractFile(
  fileBuffer: Buffer,
  fileName: string
): { rows: ParsedRow[]; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Parse Excel/CSV
  let worksheet: XLSX.WorkSheet;
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { rows: [], errors: ['File contains no sheets.'], warnings: [] };
    }
    worksheet = workbook.Sheets[firstSheetName];
  } catch {
    return { rows: [], errors: [`Failed to parse file "${fileName}".`], warnings: [] };
  }

  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: null,
    raw: false,
  });

  if (rawRows.length === 0) {
    return { rows: [], errors: ['File contains no data rows.'], warnings: [] };
  }

  // Match headers
  const headers = Object.keys(rawRows[0]);
  const headerMap = matchHeaders(headers);

  // Check required columns
  const required = ['distributorCode', 'itemNumber', 'deviatedPrice'];
  const missing = required.filter(f => !headerMap[f]);
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [`Missing required columns: ${missing.join(', ')}. Found headers: ${headers.join(', ')}`],
      warnings: [],
    };
  }

  if (!headerMap.endUserCode && !headerMap.endUserName) {
    warnings.push('No end user column found — rows will need an end user assigned.');
  }
  if (!headerMap.planCode) {
    warnings.push('No plan code column found — will use "DEFAULT" as plan code.');
  }

  const rows: ParsedRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 2; // 1-indexed + header row

    const getValue = (field: string): string => {
      const col = headerMap[field];
      if (!col) return '';
      const val = raw[col];
      return val != null ? String(val).trim() : '';
    };

    const distributorCode = getValue('distributorCode').toUpperCase();
    const itemNumber = getValue('itemNumber');
    const priceStr = getValue('deviatedPrice').replace(/[$,]/g, '');
    const deviatedPrice = parseFloat(priceStr);

    if (!distributorCode) {
      errors.push(`Row ${rowNum}: Missing distributor code`);
      continue;
    }
    if (!itemNumber) {
      errors.push(`Row ${rowNum}: Missing item number`);
      continue;
    }
    if (isNaN(deviatedPrice) || deviatedPrice < 0) {
      errors.push(`Row ${rowNum}: Invalid price "${getValue('deviatedPrice')}"`);
      continue;
    }

    const endUserCode = getValue('endUserCode').toUpperCase() || 'GENERAL';
    const endUserName = getValue('endUserName') || endUserCode;
    const planCode = getValue('planCode').toUpperCase() || 'DEFAULT';
    const discountType = getValue('discountType').toLowerCase() || 'part';

    // Parse dates
    const startDate = parseFlexDate(getValue('startDate'));
    const endDate = parseFlexDate(getValue('endDate'));

    if (!startDate) {
      errors.push(`Row ${rowNum}: Missing or invalid start date "${getValue('startDate')}"`);
      continue;
    }

    rows.push({
      rowNum,
      distributorCode,
      endUserCode,
      endUserName,
      planCode,
      discountType: discountType === 'product_code' ? 'product_code' : 'part',
      itemNumber,
      deviatedPrice,
      startDate,
      endDate: endDate || '',
      description: getValue('description'),
    });
  }

  return { rows, errors, warnings };
}

function parseFlexDate(val: string): string {
  if (!val) return '';
  // Try ISO format first
  const isoMatch = val.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  // Try MM/DD/YYYY
  const usMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
  // Try M/D/YY
  const shortMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (shortMatch) {
    const yr = parseInt(shortMatch[3]) > 50 ? `19${shortMatch[3]}` : `20${shortMatch[3]}`;
    return `${yr}-${shortMatch[1].padStart(2, '0')}-${shortMatch[2].padStart(2, '0')}`;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Preview (parse + group, no writes)
// ---------------------------------------------------------------------------

export async function previewContractImport(
  fileBuffer: Buffer,
  fileName: string
): Promise<ContractImportResult> {
  const { rows, errors, warnings } = parseContractFile(fileBuffer, fileName);

  if (errors.length > 0 && rows.length === 0) {
    return { success: false, contractsCreated: 0, plansCreated: 0, recordsCreated: 0, errors, warnings };
  }

  // Group rows by distributor+endUser → contract, then by planCode → plan
  const groups = groupRows(rows);

  // Auto-assign contract numbers for preview
  const currentMax = await getCurrentMaxContractNumber();
  let nextNum = currentMax + 1;

  const preview: ContractPreviewGroup[] = [];

  for (const group of groups) {
    // Look up distributor name
    const dist = await prisma.distributor.findFirst({ where: { code: group.distributorCode } });

    for (const [planCode, planRows] of Object.entries(group.plans)) {
      const firstRow = planRows[0];
      preview.push({
        distributorCode: group.distributorCode,
        distributorName: dist?.name || group.distributorCode,
        endUserCode: group.endUserCode,
        endUserName: group.endUserName,
        contractNumber: String(nextNum),
        planCode,
        discountType: firstRow.discountType,
        description: firstRow.description,
        startDate: firstRow.startDate,
        endDate: firstRow.endDate,
        lineItems: planRows.map(r => ({
          itemNumber: r.itemNumber,
          deviatedPrice: r.deviatedPrice,
          startDate: r.startDate,
          endDate: r.endDate,
        })),
      });
    }
    nextNum++;
  }

  return {
    success: true,
    contractsCreated: groups.length,
    plansCreated: preview.length,
    recordsCreated: rows.length,
    errors,
    warnings,
    preview,
  };
}

// ---------------------------------------------------------------------------
// Commit (all-or-nothing transaction)
// ---------------------------------------------------------------------------

export async function commitContractImport(
  fileBuffer: Buffer,
  fileName: string,
  userId: number
): Promise<ContractImportResult> {
  const { rows, errors, warnings } = parseContractFile(fileBuffer, fileName);

  if (rows.length === 0) {
    return { success: false, contractsCreated: 0, plansCreated: 0, recordsCreated: 0, errors, warnings };
  }

  const groups = groupRows(rows);

  // Pre-validate: check all distributors exist before entering transaction
  const distributorMap = new Map<string, { id: number; code: string }>();
  for (const group of groups) {
    if (!distributorMap.has(group.distributorCode)) {
      const dist = await prisma.distributor.findFirst({ where: { code: group.distributorCode } });
      if (!dist) {
        errors.push(`Distributor "${group.distributorCode}" not found in system`);
      } else {
        distributorMap.set(group.distributorCode, { id: dist.id, code: dist.code });
      }
    }
  }

  // If any distributors are missing, fail before writing anything
  if (errors.length > 0) {
    return { success: false, contractsCreated: 0, plansCreated: 0, recordsCreated: 0, errors, warnings };
  }

  // All writes in a single transaction — if anything fails, everything rolls back
  const result = await prisma.$transaction(async (tx) => {
    let contractsCreated = 0;
    let plansCreated = 0;
    let recordsCreated = 0;

    for (const group of groups) {
      const distributor = distributorMap.get(group.distributorCode)!;

      // Resolve or create end user
      let endUser = await tx.endUser.findFirst({ where: { code: group.endUserCode } });
      if (!endUser) {
        endUser = await tx.endUser.create({
          data: { code: group.endUserCode, name: group.endUserName },
        });
        await auditInTx(tx, 'end_users', endUser.id, {
          code: endUser.code,
          name: endUser.name,
          source: 'contract_import',
        }, userId);
        warnings.push(`Created new end user: ${endUser.code} — ${endUser.name}`);
      }

      // Generate contract number inside transaction to avoid race conditions
      const contractNumber = await generateContractNumber(tx);

      // Determine contract dates from all rows in this group
      const allRows = Object.values(group.plans).flat();
      const contractStartDate = allRows.reduce((min, r) => r.startDate < min ? r.startDate : min, allRows[0].startDate);
      const contractEndDate = allRows.reduce((max, r) => (r.endDate && r.endDate > max) ? r.endDate : max, '');

      // Create contract
      const contract = await tx.contract.create({
        data: {
          distributorId: distributor.id,
          endUserId: endUser.id,
          contractNumber,
          description: allRows[0].description || null,
          startDate: contractStartDate ? new Date(contractStartDate) : null,
          endDate: contractEndDate ? new Date(contractEndDate) : null,
          status: 'pending_review',
        },
      });

      await auditInTx(tx, 'contracts', contract.id, {
        distributorId: distributor.id,
        endUserId: endUser.id,
        contractNumber,
        source: 'contract_import',
        fileName,
      }, userId);

      contractsCreated++;

      // Create plans and records
      for (const [planCode, planRows] of Object.entries(group.plans)) {
        const firstRow = planRows[0];

        const plan = await tx.rebatePlan.create({
          data: {
            contractId: contract.id,
            planCode,
            planName: firstRow.description || null,
            discountType: firstRow.discountType,
            status: 'active',
          },
        });

        await auditInTx(tx, 'rebate_plans', plan.id, {
          contractId: contract.id,
          planCode,
          discountType: firstRow.discountType,
          source: 'contract_import',
        }, userId);

        plansCreated++;

        // Create rebate records for each line item
        for (const row of planRows) {
          // Resolve or create item
          let item = await tx.item.findFirst({ where: { itemNumber: row.itemNumber } });
          if (!item) {
            item = await tx.item.create({
              data: { itemNumber: row.itemNumber },
            });
            warnings.push(`Created new item: ${row.itemNumber}`);
          }

          const startDate = new Date(row.startDate);
          const endDate = row.endDate ? new Date(row.endDate) : null;
          const status = deriveRecordStatus(startDate, endDate, null, 'active', new Date());

          await tx.rebateRecord.create({
            data: {
              rebatePlanId: plan.id,
              itemId: item.id,
              rebatePrice: row.deviatedPrice,
              startDate,
              endDate,
              status,
              createdById: userId,
              updatedById: userId,
            },
          });

          recordsCreated++;
        }
      }
    }

    return { contractsCreated, plansCreated, recordsCreated };
  });

  return {
    success: true,
    contractsCreated: result.contractsCreated,
    plansCreated: result.plansCreated,
    recordsCreated: result.recordsCreated,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Simple import: file with item number + price columns + context from form
// ---------------------------------------------------------------------------

export interface SimpleImportContext {
  distributorId: number;
  endUserId: number;
  planCode: string;
  planName?: string;
  discountType: string;
  description?: string;
  customerNumber?: string;
  contractType?: string;   // fixed_term (default) or evergreen
  noticePeriodDays?: number;
  startDate: string;
  endDate?: string;
}

/** User-confirmed column mapping for contract file */
export interface ContractColumnMapping {
  itemNumberColumn: string;  // The exact header name to use for item/part number
  priceColumn: string;       // The exact header name to use for price
}

export interface SimpleLineItem {
  itemNumber: string;
  price: number;
  rowNum: number;
  description?: string;
}

export interface SimpleParseResult {
  items: SimpleLineItem[];
  errors: string[];
  warnings: string[];
}

/** Result from reading file headers — used for column mapping UI */
export interface FileHeadersResult {
  headers: string[];
  sampleRows: Record<string, string>[];  // First few rows for preview
  suggestedMapping: {
    itemNumberColumn: string | null;
    priceColumn: string | null;
  };
  rowCount: number;
}

// Patterns for auto-suggesting column mappings
const PART_PATTERNS = [
  /^supplier[\s._-]?p\/?n$/i,
  /part[\s._-]?number/i,
  /part[\s._-]?#/i,
  /item[\s._-]?number/i,
  /item[\s._-]?#/i,
  /sku/i,
  /^part$/i,
  /^item$/i,
  /brennan[\s._-]?p/i,
];

const PRICE_PATTERNS = [
  /agreement[\s._-]?price/i,
  /net[\s._-]?price/i,
  /deviated[\s._-]?price/i,
  /list[\s._-]?price/i,
  /rebate[\s._-]?price/i,
  /\bnet$/i,
  /\bprice$/i,
  /\bcost$/i,
];

// ---------------------------------------------------------------------------
// Fastenal SPA format detection and parsing
// ---------------------------------------------------------------------------

/**
 * Detect whether a worksheet is a Fastenal SPA form.
 * Checks for "Special Pricing Agreement" in the header area (rows 1-5).
 */
function isFastenalSPA(ws: XLSX.WorkSheet): boolean {
  try {
    // Check cells A1-H5 for the SPA title
    const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    for (let r = 1; r <= 5; r++) {
      for (const c of cols) {
        const cell = ws[`${c}${r}`];
        if (cell && typeof cell.v === 'string' && /special pricing agreement/i.test(cell.v)) {
          return true;
        }
      }
    }
  } catch {
    // If worksheet structure doesn't support cell access, it's not an SPA
  }
  return false;
}

/**
 * Extract metadata from a Fastenal SPA header (rows 1-20).
 */
function extractSPAMetadata(ws: XLSX.WorkSheet): {
  agreementNumber: string | null;
  endUser: string | null;
  effectiveDate: string | null;
} {
  const getCell = (ref: string) => {
    const cell = ws[ref];
    return cell ? String(cell.v).trim() : null;
  };
  return {
    agreementNumber: getCell('D6'),
    endUser: getCell('D10'),
    effectiveDate: getCell('D7'),
  };
}

/**
 * Parse line items from a Fastenal SPA worksheet.
 * Headers are in row 22, data starts at row 23.
 * Supplier P/N is in column B, Agreement Price in column G.
 */
function parseSPALineItems(ws: XLSX.WorkSheet): SimpleParseResult {
  const items: SimpleLineItem[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenParts = new Set<string>();

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

  for (let r = 22; r <= range.e.r; r++) { // Row 23+ (0-indexed = 22+)
    const supplierCell = ws[XLSX.utils.encode_cell({ r, c: 1 })]; // Column B
    const priceCell = ws[XLSX.utils.encode_cell({ r, c: 6 })];    // Column G
    const descCell = ws[XLSX.utils.encode_cell({ r, c: 3 })];     // Column D

    const itemNumber = supplierCell ? String(supplierCell.v).trim() : '';
    if (!itemNumber) continue; // Skip empty rows

    const priceVal = priceCell ? priceCell.v : null;
    const priceStr = priceVal != null ? String(priceVal).replace(/[$,\s]/g, '') : '';
    const price = parseFloat(priceStr);

    if (isNaN(price) || price < 0) {
      errors.push(`Row ${r + 1}: Invalid price for "${itemNumber}"`);
      continue;
    }

    if (seenParts.has(itemNumber.toUpperCase())) {
      warnings.push(`Row ${r + 1}: Duplicate item "${itemNumber}" — only the first occurrence will be used`);
      continue;
    }
    seenParts.add(itemNumber.toUpperCase());

    const description = descCell ? String(descCell.v).trim() : '';

    items.push({ itemNumber, price, rowNum: r + 1, description: description || undefined });
  }

  if (items.length === 0) {
    errors.push('No valid line items found in the SPA file (expected data starting at row 23, column B).');
  }

  return { items, errors, warnings };
}

/**
 * Read headers from a contract file and suggest column mappings.
 * Called before parsing — allows the user to confirm/correct the mapping.
 * Detects Fastenal SPA format and returns pre-mapped results for those files.
 */
export function readContractFileHeaders(
  fileBuffer: Buffer,
  fileName: string
): FileHeadersResult | { error: string } {
  let worksheet: XLSX.WorkSheet;
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { error: 'File contains no sheets.' };
    }
    worksheet = workbook.Sheets[firstSheetName];
  } catch {
    return { error: `Failed to parse file "${fileName}".` };
  }

  // Detect Fastenal SPA format
  if (isFastenalSPA(worksheet)) {
    const metadata = extractSPAMetadata(worksheet);
    const parsed = parseSPALineItems(worksheet);
    const sampleItems = parsed.items.slice(0, 5).map(item => ({
      'Supplier P/N': item.itemNumber,
      'Agreement Price': String(item.price),
      'Description': item.description || '',
    }));
    return {
      headers: ['Supplier P/N', 'Agreement Price'],
      sampleRows: sampleItems,
      suggestedMapping: {
        itemNumberColumn: 'Supplier P/N',
        priceColumn: 'Agreement Price',
      },
      rowCount: parsed.items.length,
      fastenalSPA: true,
      spaMetadata: metadata,
    } as FileHeadersResult & { fastenalSPA: boolean; spaMetadata: typeof metadata };
  }

  // Standard flat file parsing
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: null,
    raw: false,
  });

  if (rawRows.length === 0) {
    return { error: 'File contains no data rows.' };
  }

  const headers = Object.keys(rawRows[0]);

  // Auto-suggest based on patterns
  const suggestedItem = headers.find(h => PART_PATTERNS.some(p => p.test(h.trim()))) || null;
  const suggestedPrice = headers.find(h => PRICE_PATTERNS.some(p => p.test(h.trim()))) || null;

  // Sample first 5 rows for preview
  const sampleRows = rawRows.slice(0, 5).map(row => {
    const sample: Record<string, string> = {};
    for (const h of headers) {
      sample[h] = row[h] != null ? String(row[h]).trim() : '';
    }
    return sample;
  });

  return {
    headers,
    sampleRows,
    suggestedMapping: {
      itemNumberColumn: suggestedItem,
      priceColumn: suggestedPrice,
    },
    rowCount: rawRows.length,
  };
}

/**
 * Parse a contract file using a user-confirmed column mapping.
 * The mapping tells us exactly which column is item number and which is price.
 */
export function parseSimpleContractFile(
  fileBuffer: Buffer,
  fileName: string,
  columnMapping?: ContractColumnMapping,
  contractNumber?: string,
): SimpleParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let worksheet: XLSX.WorkSheet;
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { items: [], errors: ['File contains no sheets.'], warnings: [] };
    }
    worksheet = workbook.Sheets[firstSheetName];
  } catch {
    return { items: [], errors: [`Failed to parse file "${fileName}".`], warnings: [] };
  }

  // Detect Fastenal SPA format — use dedicated parser
  if (isFastenalSPA(worksheet)) {
    const spaMetadata = extractSPAMetadata(worksheet);
    const parsed = parseSPALineItems(worksheet);

    // Validate Agreement # matches the contract being updated
    if (contractNumber && spaMetadata.agreementNumber) {
      const spaAgreement = spaMetadata.agreementNumber.trim();
      const contractNum = contractNumber.trim();
      if (spaAgreement !== contractNum) {
        parsed.warnings.unshift(
          `Agreement # on SPA form (${spaAgreement}) does not match contract number (${contractNum}). Please verify this is the correct file.`
        );
      }
    }

    return parsed;
  }

  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: null,
    raw: false,
  });

  if (rawRows.length === 0) {
    return { items: [], errors: ['File contains no data rows.'], warnings: [] };
  }

  const headers = Object.keys(rawRows[0]);

  // Use explicit mapping if provided, otherwise fall back to auto-detect
  let partCol: string | undefined;
  let priceCol: string | undefined;

  if (columnMapping) {
    partCol = columnMapping.itemNumberColumn;
    priceCol = columnMapping.priceColumn;
    // Validate the mapping references actual headers
    if (!headers.includes(partCol)) {
      return { items: [], errors: [`Mapped item number column "${partCol}" not found in file headers.`], warnings: [] };
    }
    if (!headers.includes(priceCol)) {
      return { items: [], errors: [`Mapped price column "${priceCol}" not found in file headers.`], warnings: [] };
    }
  } else {
    // Auto-detect (legacy fallback)
    partCol = headers.find(h => PART_PATTERNS.some(p => p.test(h.trim())));
    priceCol = headers.find(h => PRICE_PATTERNS.some(p => p.test(h.trim())));

    if (!partCol) {
      return { items: [], errors: [`Could not find a part number column. Found headers: ${headers.join(', ')}`], warnings: [] };
    }
    if (!priceCol) {
      return { items: [], errors: [`Could not find a price column. Found headers: ${headers.join(', ')}`], warnings: [] };
    }
  }

  // Note which columns are being used/ignored
  const otherCols = headers.filter(h => h !== partCol && h !== priceCol);
  if (otherCols.length > 0) {
    warnings.push(`Using "${partCol}" as Item Number and "${priceCol}" as Price. Ignoring: ${otherCols.join(', ')}`);
  }

  const items: SimpleLineItem[] = [];
  const seenParts = new Set<string>();

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 2;

    const partVal = raw[partCol];
    const priceVal = raw[priceCol];

    const itemNumber = partVal != null ? String(partVal).trim() : '';
    const priceStr = priceVal != null ? String(priceVal).trim().replace(/[$,]/g, '') : '';
    const price = parseFloat(priceStr);

    if (!itemNumber) {
      errors.push(`Row ${rowNum}: Missing part number`);
      continue;
    }
    if (isNaN(price) || price < 0) {
      errors.push(`Row ${rowNum}: Invalid price "${priceVal != null ? String(priceVal).trim() : ''}"`);
      continue;
    }
    if (seenParts.has(itemNumber.toUpperCase())) {
      warnings.push(`Row ${rowNum}: Duplicate part number "${itemNumber}" — will use this row's price`);
      const idx = items.findIndex(it => it.itemNumber.toUpperCase() === itemNumber.toUpperCase());
      if (idx >= 0) items.splice(idx, 1);
    }
    seenParts.add(itemNumber.toUpperCase());

    items.push({ itemNumber, price, rowNum });
  }

  return { items, errors, warnings };
}

/**
 * Preview a simple import: parse file + apply context, return what would be created.
 */
export async function previewSimpleImport(
  fileBuffer: Buffer,
  fileName: string,
  context: SimpleImportContext,
  columnMapping?: ContractColumnMapping
): Promise<ContractImportResult> {
  const { items, errors, warnings } = parseSimpleContractFile(fileBuffer, fileName, columnMapping);

  if (items.length === 0) {
    return { success: false, contractsCreated: 0, plansCreated: 0, recordsCreated: 0, errors, warnings };
  }

  // Look up distributor for display name
  const dist = await prisma.distributor.findUnique({ where: { id: context.distributorId } });
  const endUser = await prisma.endUser.findUnique({ where: { id: context.endUserId } });
  const contractNumber = String((await getCurrentMaxContractNumber()) + 1);

  const preview: ContractPreviewGroup[] = [{
    distributorCode: dist?.code || 'UNKNOWN',
    distributorName: dist?.name || '',
    endUserCode: endUser?.code || 'UNKNOWN',
    endUserName: endUser?.name || '',
    contractNumber,
    planCode: context.planCode,
    discountType: context.discountType,
    description: context.description || '',
    startDate: context.startDate,
    endDate: context.endDate || '',
    lineItems: items.map(it => ({
      itemNumber: it.itemNumber,
      deviatedPrice: it.price,
      startDate: context.startDate,
      endDate: context.endDate || '',
    })),
  }];

  return {
    success: true,
    contractsCreated: 1,
    plansCreated: 1,
    recordsCreated: items.length,
    errors,
    warnings,
    preview,
  };
}

/**
 * Commit a simple import: create contract + plan + records from file + context.
 * All writes happen in a single transaction — if anything fails, nothing is created.
 */
export async function commitSimpleImport(
  fileBuffer: Buffer,
  fileName: string,
  context: SimpleImportContext,
  userId: number,
  columnMapping?: ContractColumnMapping
): Promise<ContractImportResult> {
  const { items, errors, warnings } = parseSimpleContractFile(fileBuffer, fileName, columnMapping);

  if (items.length === 0) {
    return { success: false, contractsCreated: 0, plansCreated: 0, recordsCreated: 0, errors, warnings };
  }

  // Pre-validate outside transaction
  const distributor = await prisma.distributor.findUnique({ where: { id: context.distributorId } });
  if (!distributor) {
    return { success: false, contractsCreated: 0, plansCreated: 0, recordsCreated: 0, errors: ['Distributor not found'], warnings };
  }
  const endUser = await prisma.endUser.findUnique({ where: { id: context.endUserId } });
  if (!endUser) {
    return { success: false, contractsCreated: 0, plansCreated: 0, recordsCreated: 0, errors: ['End user not found'], warnings };
  }

  const startDate = new Date(context.startDate);
  const endDate = context.endDate ? new Date(context.endDate) : null;

  // All writes in a single transaction
  const result = await prisma.$transaction(async (tx) => {
    const contractNumber = await generateContractNumber(tx);

    const contractType = context.contractType || 'fixed_term';
    const contract = await tx.contract.create({
      data: {
        distributorId: distributor.id,
        endUserId: endUser.id,
        contractNumber,
        customerNumber: context.customerNumber || null,
        description: context.description || null,
        contractType,
        noticePeriodDays: contractType === 'evergreen' && context.noticePeriodDays
          ? context.noticePeriodDays
          : null,
        startDate,
        endDate,
        status: 'pending_review',
      },
    });
    await auditInTx(tx, 'contracts', contract.id, {
      distributorId: distributor.id,
      endUserId: endUser.id,
      contractNumber,
      customerNumber: context.customerNumber || null,
      contractType,
      source: 'simple_import',
      fileName,
    }, userId);

    const plan = await tx.rebatePlan.create({
      data: {
        contractId: contract.id,
        planCode: context.planCode,
        planName: context.planName || null,
        discountType: context.discountType,
        status: 'active',
      },
    });
    await auditInTx(tx, 'rebate_plans', plan.id, {
      contractId: contract.id,
      planCode: context.planCode,
      source: 'simple_import',
    }, userId);

    let recordsCreated = 0;

    for (const lineItem of items) {
      // Resolve or create item
      let item = await tx.item.findFirst({ where: { itemNumber: lineItem.itemNumber } });
      if (!item) {
        item = await tx.item.create({ data: { itemNumber: lineItem.itemNumber } });
        warnings.push(`Created new item: ${lineItem.itemNumber}`);
      }

      const status = deriveRecordStatus(startDate, endDate, null, 'active', new Date());

      await tx.rebateRecord.create({
        data: {
          rebatePlanId: plan.id,
          itemId: item.id,
          rebatePrice: lineItem.price,
          startDate,
          endDate,
          status,
          createdById: userId,
          updatedById: userId,
        },
      });
      recordsCreated++;
    }

    return { contractId: contract.id, recordsCreated };
  });

  return {
    success: true,
    contractId: result.contractId,
    contractsCreated: 1,
    plansCreated: 1,
    recordsCreated: result.recordsCreated,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RowGroup {
  distributorCode: string;
  endUserCode: string;
  endUserName: string;
  plans: Record<string, ParsedRow[]>;
}

function groupRows(rows: ParsedRow[]): RowGroup[] {
  const map = new Map<string, RowGroup>();

  for (const row of rows) {
    const key = `${row.distributorCode}|${row.endUserCode}`;
    let group = map.get(key);
    if (!group) {
      group = {
        distributorCode: row.distributorCode,
        endUserCode: row.endUserCode,
        endUserName: row.endUserName,
        plans: {},
      };
      map.set(key, group);
    }
    if (!group.plans[row.planCode]) {
      group.plans[row.planCode] = [];
    }
    group.plans[row.planCode].push(row);
  }

  return Array.from(map.values());
}

async function getCurrentMaxContractNumber(): Promise<number> {
  const contracts = await prisma.contract.findMany({
    select: { contractNumber: true },
    orderBy: { contractNumber: 'desc' },
    take: 1,
  });

  if (contracts.length === 0) return 100000;
  const num = parseInt(contracts[0].contractNumber, 10);
  return isNaN(num) ? 100000 : num;
}
