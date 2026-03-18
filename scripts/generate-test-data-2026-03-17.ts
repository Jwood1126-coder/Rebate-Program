/**
 * Generate test data files dated 2026-03-17.
 * Produces claim files, contract files, and POS files for distributors
 * that now have seed data: HSC, AIT, LGG, TIPCO (plus fresh FAS/MOTION claims for Mar 2026).
 *
 * Run: npx tsx scripts/generate-test-data-2026-03-17.ts
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const outDir = path.join(process.cwd(), 'public', 'test-data');

function writeXlsx(filename: string, sheetName: string, rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const filePath = path.join(outDir, filename);
  XLSX.writeFile(wb, filePath);
  console.log(`  ✓ ${filename} (${rows.length} rows)`);
}

console.log('Generating test data files (2026-03-17)...\n');

// ============================================================================
// 1. HSC Claim — March 2026 (HSC / Volvo, contract 103200, plan HYD)
//    Expect: some matches + CLM-001 price mismatch + CLM-003 item not in contract
// ============================================================================
writeXlsx('hsc-claim-mar2026.xlsx', 'Claims', [
  // 5 matching rows (items on contract at correct prices)
  { 'Contract #': '103200', 'Part Number': '6800-08-08', 'Transaction Date': '2026-03-05', 'Deviated Price': 3.15, 'Qty': 20, 'Claimed Amount': 12.00, 'End User': 'VOLVO' },
  { 'Contract #': '103200', 'Part Number': '6800-12-12', 'Transaction Date': '2026-03-07', 'Deviated Price': 4.90, 'Qty': 15, 'Claimed Amount': 10.50, 'End User': 'VOLVO' },
  { 'Contract #': '103200', 'Part Number': '6800-16-16', 'Transaction Date': '2026-03-10', 'Deviated Price': 6.75, 'Qty': 10, 'Claimed Amount': 8.00, 'End User': 'VOLVO' },
  { 'Contract #': '103200', 'Part Number': '6800-20-20', 'Transaction Date': '2026-03-12', 'Deviated Price': 9.40, 'Qty': 8, 'Claimed Amount': 7.20, 'End User': 'VOLVO' },
  { 'Contract #': '103200', 'Part Number': '6800-04-04', 'Transaction Date': '2026-03-15', 'Deviated Price': 1.85, 'Qty': 50, 'Claimed Amount': 25.00, 'End User': 'VOLVO' },
  // CLM-001: price mismatch (contract price is 3.15, claiming 2.99)
  { 'Contract #': '103200', 'Part Number': '6800-08-08', 'Transaction Date': '2026-03-18', 'Deviated Price': 2.99, 'Qty': 30, 'Claimed Amount': 15.00, 'End User': 'VOLVO' },
  // CLM-003: item not on this contract
  { 'Contract #': '103200', 'Part Number': '2200-A-08', 'Transaction Date': '2026-03-20', 'Deviated Price': 0.65, 'Qty': 100, 'Claimed Amount': 65.00, 'End User': 'VOLVO' },
  // CLM-006: completely unknown item
  { 'Contract #': '103200', 'Part Number': 'UNKNOWN-999', 'Transaction Date': '2026-03-22', 'Deviated Price': 5.50, 'Qty': 5, 'Claimed Amount': 27.50, 'End User': 'VOLVO' },
]);

// ============================================================================
// 2. AIT Claim — March 2026 (AIT / Kubota, contract 104100, plan SS)
//    Expect: matches + CLM-004 contract not found + CLM-007 expired contract
// ============================================================================
writeXlsx('ait-claim-mar2026.xlsx', 'Claims', [
  // 4 matching rows
  { 'Contract Number': '104100', 'Item': 'SS-0404', 'Trans Date': '2026-03-03', 'Price': 2.10, 'Quantity': 25, 'Amount': 52.50, 'End User Code': 'KUBOTA' },
  { 'Contract Number': '104100', 'Item': 'SS-0808', 'Trans Date': '2026-03-06', 'Price': 3.45, 'Quantity': 20, 'Amount': 69.00, 'End User Code': 'KUBOTA' },
  { 'Contract Number': '104100', 'Item': 'SS-1212', 'Trans Date': '2026-03-09', 'Price': 5.20, 'Quantity': 12, 'Amount': 62.40, 'End User Code': 'KUBOTA' },
  { 'Contract Number': '104100', 'Item': 'SS-1616', 'Trans Date': '2026-03-12', 'Price': 7.80, 'Quantity': 8, 'Amount': 62.40, 'End User Code': 'KUBOTA' },
  // CLM-001: price mismatch (contract is 3.45, claiming 3.99)
  { 'Contract Number': '104100', 'Item': 'SS-0808', 'Trans Date': '2026-03-15', 'Price': 3.99, 'Quantity': 15, 'Amount': 59.85, 'End User Code': 'KUBOTA' },
  // CLM-004: contract doesn't exist
  { 'Contract Number': '999999', 'Item': 'SS-0404', 'Trans Date': '2026-03-18', 'Price': 2.10, 'Quantity': 10, 'Amount': 21.00, 'End User Code': 'KUBOTA' },
  // CLM-006: unknown item
  { 'Contract Number': '104100', 'Item': 'BOGUS-PART', 'Trans Date': '2026-03-20', 'Price': 12.00, 'Quantity': 3, 'Amount': 36.00, 'End User Code': 'KUBOTA' },
]);

// ============================================================================
// 3. LGG Claim — March 2026 (LGG / Deere, contract 105100, plan CPL)
// ============================================================================
writeXlsx('lgg-claim-mar2026.xlsx', 'Claims', [
  { 'Contract #': '105100', 'Part Number': '4400-08-08', 'Transaction Date': '2026-03-04', 'Deviated Price': 4.50, 'Qty': 30, 'Claimed Amount': 15.00, 'End User': 'DEERE' },
  { 'Contract #': '105100', 'Part Number': '4400-12-12', 'Transaction Date': '2026-03-08', 'Deviated Price': 6.20, 'Qty': 20, 'Claimed Amount': 12.00, 'End User': 'DEERE' },
  { 'Contract #': '105100', 'Part Number': '4400-16-16', 'Transaction Date': '2026-03-11', 'Deviated Price': 8.10, 'Qty': 15, 'Claimed Amount': 10.50, 'End User': 'DEERE' },
  { 'Contract #': '105100', 'Part Number': '4400-20-20', 'Transaction Date': '2026-03-14', 'Deviated Price': 10.30, 'Qty': 10, 'Claimed Amount': 8.00, 'End User': 'DEERE' },
  // CLM-001: price off
  { 'Contract #': '105100', 'Part Number': '4400-08-08', 'Transaction Date': '2026-03-17', 'Deviated Price': 5.00, 'Qty': 25, 'Claimed Amount': 12.50, 'End User': 'DEERE' },
  // CLM-009: duplicate claim line (same item+date as row 1)
  { 'Contract #': '105100', 'Part Number': '4400-08-08', 'Transaction Date': '2026-03-04', 'Deviated Price': 4.50, 'Qty': 30, 'Claimed Amount': 15.00, 'End User': 'DEERE' },
]);

// ============================================================================
// 4. TIPCO Claim — March 2026 (TIPCO / Volvo, contract 106100, plan HP)
// ============================================================================
writeXlsx('tipco-claim-mar2026.xlsx', 'Claims', [
  { 'Contract #': '106100', 'Part Number': '7000-12', 'Transaction Date': '2026-03-02', 'Deviated Price': 12.50, 'Qty': 10, 'Claimed Amount': 25.00, 'End User': 'VOLVO' },
  { 'Contract #': '106100', 'Part Number': '7001-12', 'Transaction Date': '2026-03-06', 'Deviated Price': 14.75, 'Qty': 8, 'Claimed Amount': 22.00, 'End User': 'VOLVO' },
  { 'Contract #': '106100', 'Part Number': '7002-12', 'Transaction Date': '2026-03-10', 'Deviated Price': 11.20, 'Qty': 12, 'Claimed Amount': 18.00, 'End User': 'VOLVO' },
  { 'Contract #': '106100', 'Part Number': '7000-16', 'Transaction Date': '2026-03-14', 'Deviated Price': 16.90, 'Qty': 6, 'Claimed Amount': 15.00, 'End User': 'VOLVO' },
  // CLM-001: price mismatch
  { 'Contract #': '106100', 'Part Number': '7000-12', 'Transaction Date': '2026-03-18', 'Deviated Price': 11.00, 'Qty': 10, 'Claimed Amount': 20.00, 'End User': 'VOLVO' },
  // CLM-003: item not on contract
  { 'Contract #': '106100', 'Part Number': '0304-C-04', 'Transaction Date': '2026-03-20', 'Deviated Price': 0.30, 'Qty': 200, 'Claimed Amount': 60.00, 'End User': 'VOLVO' },
]);

// ============================================================================
// 5. FAS Claim — March 2026 (fresh month, FAS / Link-Belt, contract 101700)
// ============================================================================
writeXlsx('fas-claim-mar2026.xlsx', 'Claims', [
  { 'Contract #': '101700', 'Part Number': '0304-C-04', 'Transaction Date': '2026-03-03', 'Deviated Price': 0.30, 'Qty': 100, 'Claimed Amount': 30.00, 'End User': 'LINK-BELT' },
  { 'Contract #': '101700', 'Part Number': '0304-C-06', 'Transaction Date': '2026-03-05', 'Deviated Price': 0.37, 'Qty': 80, 'Claimed Amount': 29.60, 'End User': 'LINK-BELT' },
  { 'Contract #': '101700', 'Part Number': '0304-C-08', 'Transaction Date': '2026-03-08', 'Deviated Price': 0.51, 'Qty': 60, 'Claimed Amount': 30.60, 'End User': 'LINK-BELT' },
  { 'Contract #': '101700', 'Part Number': '0305-B-08', 'Transaction Date': '2026-03-10', 'Deviated Price': 0.45, 'Qty': 75, 'Claimed Amount': 33.75, 'End User': 'LINK-BELT' },
  { 'Contract #': '101700', 'Part Number': '1700-16-16', 'Transaction Date': '2026-03-12', 'Deviated Price': 9.30, 'Qty': 10, 'Claimed Amount': 93.00, 'End User': 'LINK-BELT' },
  { 'Contract #': '101700', 'Part Number': '2403-16-16', 'Transaction Date': '2026-03-15', 'Deviated Price': 2.43, 'Qty': 40, 'Claimed Amount': 97.20, 'End User': 'LINK-BELT' },
  // CLM-001: price mismatch (contract 0.30, claiming 0.35)
  { 'Contract #': '101700', 'Part Number': '0304-C-04', 'Transaction Date': '2026-03-18', 'Deviated Price': 0.35, 'Qty': 50, 'Claimed Amount': 17.50, 'End User': 'LINK-BELT' },
  // CLM-006: unknown item
  { 'Contract #': '101700', 'Part Number': 'NEW-ITEM-2026', 'Transaction Date': '2026-03-20', 'Deviated Price': 1.50, 'Qty': 20, 'Claimed Amount': 30.00, 'End User': 'LINK-BELT' },
]);

// ============================================================================
// 6. MOTION Claim — March 2026 (Motion / Komatsu, contract 102450)
// ============================================================================
writeXlsx('motion-claim-mar2026.xlsx', 'Claims', [
  { 'Contract #': '102450', 'Part Number': '6801-08-08-NWO-FG', 'Transaction Date': '2026-03-02', 'Deviated Price': 3.80, 'Qty': 25, 'Claimed Amount': 95.00, 'End User': 'KOMATSU' },
  { 'Contract #': '102450', 'Part Number': '6801-12-12-NWO-FG', 'Transaction Date': '2026-03-05', 'Deviated Price': 5.52, 'Qty': 18, 'Claimed Amount': 99.36, 'End User': 'KOMATSU' },
  { 'Contract #': '102450', 'Part Number': '6400-08-08', 'Transaction Date': '2026-03-08', 'Deviated Price': 2.90, 'Qty': 30, 'Claimed Amount': 87.00, 'End User': 'KOMATSU' },
  { 'Contract #': '102450', 'Part Number': '6400-16-16', 'Transaction Date': '2026-03-11', 'Deviated Price': 5.80, 'Qty': 12, 'Claimed Amount': 69.60, 'End User': 'KOMATSU' },
  { 'Contract #': '102450', 'Part Number': '6502-12-12', 'Transaction Date': '2026-03-14', 'Deviated Price': 7.10, 'Qty': 10, 'Claimed Amount': 71.00, 'End User': 'KOMATSU' },
  // CLM-001: price mismatch (contract 3.80, claiming 4.25)
  { 'Contract #': '102450', 'Part Number': '6801-08-08-NWO-FG', 'Transaction Date': '2026-03-17', 'Deviated Price': 4.25, 'Qty': 20, 'Claimed Amount': 85.00, 'End User': 'KOMATSU' },
  // CLM-003: item not on this contract
  { 'Contract #': '102450', 'Part Number': '0304-C-04', 'Transaction Date': '2026-03-19', 'Deviated Price': 0.30, 'Qty': 50, 'Claimed Amount': 15.00, 'End User': 'KOMATSU' },
]);

// ============================================================================
// 7. HSC Contract file — new contract to import
// ============================================================================
writeXlsx('hsc-contract-terex-2026-03-17.xlsx', 'Contract', [
  { 'Part Number': '6800-04-04', 'Rebate Price': 1.85 },
  { 'Part Number': '6800-08-08', 'Rebate Price': 3.15 },
  { 'Part Number': '6800-12-12', 'Rebate Price': 4.90 },
  { 'Part Number': '6800-16-16', 'Rebate Price': 6.75 },
  { 'Part Number': '6800-20-20', 'Rebate Price': 9.40 },
  { 'Part Number': '4400-08-08', 'Rebate Price': 4.50 },
  { 'Part Number': '4400-12-12', 'Rebate Price': 6.20 },
  { 'Part Number': 'NEW-HSC-001', 'Rebate Price': 2.35 },
  { 'Part Number': 'NEW-HSC-002', 'Rebate Price': 4.80 },
  { 'Part Number': 'NEW-HSC-003', 'Rebate Price': 7.15 },
]);

// ============================================================================
// 8. TIPCO Contract file — new contract to import
// ============================================================================
writeXlsx('tipco-contract-kubota-2026-03-17.xlsx', 'Contract', [
  { 'Item Number': '7000-12', 'Price': 12.50 },
  { 'Item Number': '7001-12', 'Price': 14.75 },
  { 'Item Number': '7002-12', 'Price': 11.20 },
  { 'Item Number': '7000-16', 'Price': 16.90 },
  { 'Item Number': '7001-16', 'Price': 18.30 },
  { 'Item Number': '7002-16', 'Price': 15.60 },
  { 'Item Number': 'SS-0404', 'Price': 2.10 },
  { 'Item Number': 'SS-0808', 'Price': 3.45 },
]);

console.log('\nDone. Files written to public/test-data/');
