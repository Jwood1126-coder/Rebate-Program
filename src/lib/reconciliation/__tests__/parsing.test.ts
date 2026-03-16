import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseClaimFile } from '../parsing.service';
import type { ColumnMapping } from '../types';

// Fastenal column mapping for tests
const fastenalMapping: ColumnMapping = {
  distributorCode: 'FAS',
  name: 'Fastenal Claim File',
  mappings: {
    contractNumber: 'Contract ID',
    itemNumber: 'Vendor Item',
    transactionDate: 'Date',
    deviatedPrice: 'Deviated Price',
    quantity: 'QTY',
    claimedAmount: 'Extended Discount Owed',
    standardPrice: 'Current Vendor Price',
    endUserCode: 'Customer',
    endUserName: 'Name',
    distributorItemNumber: 'Item',
    distributorOrderNumber: 'Order no',
    itemDescription: 'Description',
    vendorName: 'Vendor',
  },
  dateFormat: 'M/d/yyyy',
};

const periodStart = new Date(2026, 1, 1); // Feb 1, 2026
const periodEnd = new Date(2026, 1, 28); // Feb 28, 2026

/**
 * Helper: create an Excel buffer from an array of row objects.
 */
function makeExcelBuffer(rows: Record<string, unknown>[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

describe('parseClaimFile', () => {
  it('parses a valid Fastenal claim row correctly', () => {
    const buffer = makeExcelBuffer([
      {
        'Vendor': 'BRENNAN INDUSTRIES, INC',
        'Order no': 'MN008128694',
        'Date': '2/27/2026',
        'Customer': 'MN0080097',
        'Name': 'MCNEILUS TRUCK AND MFG',
        'Contract ID': '100884',
        'Item': '04017578',
        'Vendor Item': '6801-12-12-NWO-FG',
        'Description': '3/4Mix3/4MORB90Elbow',
        'Current Vendor Price': '5.5200',
        'Deviated Price': '2.7800',
        'QTY': '150',
        'Extended Discount Owed': '411.00',
      },
    ]);

    const result = parseClaimFile(buffer, 'fastenal-feb.xlsx', fastenalMapping, periodStart, periodEnd);

    expect(result.success).toBe(true);
    expect(result.totalRows).toBe(1);
    expect(result.validRows).toBe(1);
    expect(result.errorRows).toBe(0);

    const row = result.rows[0];
    expect(row.contractNumber).toBe('100884');
    expect(row.itemNumber).toBe('6801-12-12-NWO-FG');
    expect(row.deviatedPrice).toBe(2.78);
    expect(row.quantity).toBe(150);
    expect(row.claimedAmount).toBe(411);
    expect(row.standardPrice).toBe(5.52);
    expect(row.endUserCode).toBe('MN0080097');
    expect(row.endUserName).toBe('MCNEILUS TRUCK AND MFG');
    expect(row.distributorItemNumber).toBe('04017578');
    expect(row.distributorOrderNumber).toBe('MN008128694');
    expect(row.vendorName).toBe('BRENNAN INDUSTRIES, INC');
    expect(row.parseErrors).toEqual([]);
  });

  it('flags missing required fields as errors', () => {
    const buffer = makeExcelBuffer([
      {
        'Vendor': 'BRENNAN INDUSTRIES, INC',
        'Date': '2/27/2026',
        'Contract ID': '', // empty
        'Vendor Item': '', // empty
        'Deviated Price': '2.78',
        'QTY': '150',
      },
    ]);

    const result = parseClaimFile(buffer, 'test.xlsx', fastenalMapping, periodStart, periodEnd);

    expect(result.errorRows).toBe(1);
    const errors = result.rows[0].parseErrors.filter(e => e.severity === 'error');
    expect(errors.some(e => e.field === 'contractNumber')).toBe(true);
    expect(errors.some(e => e.field === 'itemNumber')).toBe(true);
  });

  it('flags invalid date as error', () => {
    const buffer = makeExcelBuffer([
      {
        'Contract ID': '100884',
        'Vendor Item': '6801-12-12-NWO-FG',
        'Date': 'not-a-date',
        'Deviated Price': '2.78',
        'QTY': '150',
      },
    ]);

    const result = parseClaimFile(buffer, 'test.xlsx', fastenalMapping, periodStart, periodEnd);

    const errors = result.rows[0].parseErrors.filter(e => e.field === 'transactionDate' && e.severity === 'error');
    expect(errors.length).toBe(1);
  });

  it('flags date outside claim period as warning', () => {
    const buffer = makeExcelBuffer([
      {
        'Contract ID': '100884',
        'Vendor Item': '6801-12-12-NWO-FG',
        'Date': '1/15/2026', // January — outside Feb period
        'Deviated Price': '2.78',
        'QTY': '150',
      },
    ]);

    const result = parseClaimFile(buffer, 'test.xlsx', fastenalMapping, periodStart, periodEnd);

    const warnings = result.rows[0].parseErrors.filter(e => e.field === 'transactionDate' && e.severity === 'warning');
    expect(warnings.length).toBe(1);
    expect(warnings[0].message).toContain('outside the claim period');
  });

  it('flags invalid prices and quantities', () => {
    const buffer = makeExcelBuffer([
      {
        'Contract ID': '100884',
        'Vendor Item': '6801-12-12-NWO-FG',
        'Date': '2/15/2026',
        'Deviated Price': 'abc',
        'QTY': '-5',
      },
    ]);

    const result = parseClaimFile(buffer, 'test.xlsx', fastenalMapping, periodStart, periodEnd);

    const errors = result.rows[0].parseErrors.filter(e => e.severity === 'error');
    expect(errors.some(e => e.field === 'deviatedPrice')).toBe(true);
    expect(errors.some(e => e.field === 'quantity')).toBe(true);
  });

  it('flags arithmetic mismatch as warning', () => {
    const buffer = makeExcelBuffer([
      {
        'Contract ID': '100884',
        'Vendor Item': '6801-12-12-NWO-FG',
        'Date': '2/15/2026',
        'Current Vendor Price': '5.5200',
        'Deviated Price': '2.7800',
        'QTY': '150',
        'Extended Discount Owed': '999.99', // Wrong — should be 411.00
      },
    ]);

    const result = parseClaimFile(buffer, 'test.xlsx', fastenalMapping, periodStart, periodEnd);

    const warnings = result.rows[0].parseErrors.filter(e => e.field === 'claimedAmount' && e.severity === 'warning');
    expect(warnings.length).toBe(1);
    expect(warnings[0].message).toContain('Arithmetic mismatch');
  });

  it('passes arithmetic check when amounts are correct', () => {
    const buffer = makeExcelBuffer([
      {
        'Contract ID': '100884',
        'Vendor Item': '6801-12-12-NWO-FG',
        'Date': '2/15/2026',
        'Current Vendor Price': '5.5200',
        'Deviated Price': '2.7800',
        'QTY': '150',
        'Extended Discount Owed': '411.00',
      },
    ]);

    const result = parseClaimFile(buffer, 'test.xlsx', fastenalMapping, periodStart, periodEnd);

    const arithmeticWarnings = result.rows[0].parseErrors.filter(e => e.field === 'claimedAmount');
    expect(arithmeticWarnings.length).toBe(0);
  });

  it('handles multiple rows with mixed validity', () => {
    const buffer = makeExcelBuffer([
      {
        'Contract ID': '100884',
        'Vendor Item': '6801-12-12-NWO-FG',
        'Date': '2/15/2026',
        'Deviated Price': '2.78',
        'QTY': '150',
      },
      {
        'Contract ID': '', // missing
        'Vendor Item': '6801-16-16-NWO-FG',
        'Date': '2/20/2026',
        'Deviated Price': '3.97',
        'QTY': '50',
      },
      {
        'Contract ID': '104291',
        'Vendor Item': '6801-12-12-NWO-FG',
        'Date': '2/26/2026',
        'Deviated Price': '4.00',
        'QTY': '25',
      },
    ]);

    const result = parseClaimFile(buffer, 'test.xlsx', fastenalMapping, periodStart, periodEnd);

    expect(result.totalRows).toBe(3);
    expect(result.validRows).toBe(2);
    expect(result.errorRows).toBe(1);
  });

  it('rejects file with missing required columns', () => {
    const buffer = makeExcelBuffer([
      {
        'Some Random Column': 'value',
        'Another Column': 'value2',
      },
    ]);

    const result = parseClaimFile(buffer, 'wrong-file.xlsx', fastenalMapping, periodStart, periodEnd);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Missing required columns');
  });

  it('rejects empty file', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Contract ID', 'Vendor Item', 'Date', 'Deviated Price', 'QTY']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    const result = parseClaimFile(buffer, 'empty.xlsx', fastenalMapping, periodStart, periodEnd);

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('no data rows');
  });

  it('detects duplicate rows and adds warning', () => {
    const buffer = makeExcelBuffer([
      {
        'Contract ID': '100884',
        'Vendor Item': '6801-12-12-NWO-FG',
        'Date': '2/15/2026',
        'Deviated Price': '2.78',
        'QTY': '150',
      },
      {
        'Contract ID': '100884',
        'Vendor Item': '6801-12-12-NWO-FG',
        'Date': '2/15/2026',
        'Deviated Price': '2.78',
        'QTY': '150',
      },
    ]);

    const result = parseClaimFile(buffer, 'test.xlsx', fastenalMapping, periodStart, periodEnd);

    expect(result.warnings.some(w => w.includes('duplicate'))).toBe(true);
  });

  it('strips currency symbols from amounts', () => {
    const buffer = makeExcelBuffer([
      {
        'Contract ID': '100884',
        'Vendor Item': '6801-12-12-NWO-FG',
        'Date': '2/15/2026',
        'Deviated Price': '$2.78',
        'QTY': '1,500',
        'Extended Discount Owed': '$4,110.00',
        'Current Vendor Price': '$5.52',
      },
    ]);

    const result = parseClaimFile(buffer, 'test.xlsx', fastenalMapping, periodStart, periodEnd);

    const row = result.rows[0];
    expect(row.deviatedPrice).toBe(2.78);
    expect(row.quantity).toBe(1500);
    expect(row.claimedAmount).toBe(4110);
    expect(row.standardPrice).toBe(5.52);
  });

  it('warns on non-Brennan vendor name', () => {
    const buffer = makeExcelBuffer([
      {
        'Vendor': 'SOME OTHER COMPANY',
        'Contract ID': '100884',
        'Vendor Item': '6801-12-12-NWO-FG',
        'Date': '2/15/2026',
        'Deviated Price': '2.78',
        'QTY': '150',
      },
    ]);

    const result = parseClaimFile(buffer, 'test.xlsx', fastenalMapping, periodStart, periodEnd);

    expect(result.errors.some(e => e.includes('vendor name'))).toBe(true);
  });

  it('preserves raw data on each row for traceability', () => {
    const buffer = makeExcelBuffer([
      {
        'Contract ID': '100884',
        'Vendor Item': '6801-12-12-NWO-FG',
        'Date': '2/15/2026',
        'Deviated Price': '2.78',
        'QTY': '150',
        'Extra Column': 'bonus data',
      },
    ]);

    const result = parseClaimFile(buffer, 'test.xlsx', fastenalMapping, periodStart, periodEnd);

    expect(result.rows[0].rawData).toBeDefined();
    expect(result.rows[0].rawData['Extra Column']).toBe('bonus data');
  });

  it('assigns correct row numbers (1-indexed, skipping header)', () => {
    const buffer = makeExcelBuffer([
      { 'Contract ID': '100884', 'Vendor Item': 'A', 'Date': '2/1/2026', 'Deviated Price': '1', 'QTY': '1' },
      { 'Contract ID': '100885', 'Vendor Item': 'B', 'Date': '2/2/2026', 'Deviated Price': '2', 'QTY': '2' },
      { 'Contract ID': '100886', 'Vendor Item': 'C', 'Date': '2/3/2026', 'Deviated Price': '3', 'QTY': '3' },
    ]);

    const result = parseClaimFile(buffer, 'test.xlsx', fastenalMapping, periodStart, periodEnd);

    expect(result.rows[0].rowNumber).toBe(2); // Row 2 in file (row 1 = header)
    expect(result.rows[1].rowNumber).toBe(3);
    expect(result.rows[2].rowNumber).toBe(4);
  });
});
