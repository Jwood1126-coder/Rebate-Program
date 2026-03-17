// Generate a full set of test data files for end-to-end workflow testing.
// Run: npx tsx scripts/generate-test-data.ts
//
// Generates:
//   1. Contract file (AIT style) — tests column mapping flow
//   2. Contract file (Fastenal SPA style) — tests column mapping with extra columns
//   3. Fastenal claim file — tests claim staging + validation against FAS contracts
//   4. Motion POS file — tests POS upload + cross-referencing
//   5. Fastenal POS file — tests POS with different format
//
// Pre-requisites: run `npx prisma db seed` first to have base data in place.

import * as XLSX from 'xlsx';
import * as path from 'path';

const outDir = path.join(process.cwd(), 'public', 'test-data');

// Ensure output directory exists
import { mkdirSync } from 'fs';
mkdirSync(outDir, { recursive: true });

function writeFile(data: Record<string, unknown>[], sheetName: string, fileName: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Auto-size columns
  if (data.length > 0) {
    const headers = Object.keys(data[0]);
    ws['!cols'] = headers.map(h => ({
      wch: Math.max(h.length, ...data.map(r => String(r[h] ?? '').length)) + 2,
    }));
  }

  const filePath = path.join(outDir, fileName);
  XLSX.writeFile(wb, filePath);
  return filePath;
}

// =========================================================================
// 1. AIT Contract File — tests column mapping with non-standard headers
// =========================================================================
// User will need to map: "Part Number" → Item Number, "7/8 Price" → Price
// Extra columns (Contract Number, End User) should be ignored since
// the user enters context in the form.

const aitContract = [
  { 'Contract Number': '104040', 'End User': 'QUALITY RAILCAR SOLUTIONS, LLC', 'Part Number': '1502-12-12-FG', '7/8 Price': 6.85 },
  { 'Contract Number': '104040', 'End User': 'QUALITY RAILCAR SOLUTIONS, LLC', 'Part Number': '1501-12-12-FG', '7/8 Price': 3.72 },
  { 'Contract Number': '104040', 'End User': 'QUALITY RAILCAR SOLUTIONS, LLC', 'Part Number': '0304-C-08', '7/8 Price': 0.55 },
  { 'Contract Number': '104040', 'End User': 'QUALITY RAILCAR SOLUTIONS, LLC', 'Part Number': '0304-C-12', '7/8 Price': 0.78 },
  { 'Contract Number': '104040', 'End User': 'QUALITY RAILCAR SOLUTIONS, LLC', 'Part Number': '6801-08-08-NWO-FG', '7/8 Price': 4.10 },
  { 'Contract Number': '104040', 'End User': 'QUALITY RAILCAR SOLUTIONS, LLC', 'Part Number': '6801-12-12-NWO-FG', '7/8 Price': 5.95 },
  { 'Contract Number': '104040', 'End User': 'QUALITY RAILCAR SOLUTIONS, LLC', 'Part Number': '6400-08-08', '7/8 Price': 3.15 },
  { 'Contract Number': '104040', 'End User': 'QUALITY RAILCAR SOLUTIONS, LLC', 'Part Number': '6400-12-12', '7/8 Price': 4.50 },
  { 'Contract Number': '104040', 'End User': 'QUALITY RAILCAR SOLUTIONS, LLC', 'Part Number': '1100-C-12', '7/8 Price': 1.30 },
  { 'Contract Number': '104040', 'End User': 'QUALITY RAILCAR SOLUTIONS, LLC', 'Part Number': '1100-D-16', '7/8 Price': 1.65 },
];

writeFile(aitContract, 'Contract', 'ait-contract-104040.xlsx');

// =========================================================================
// 2. Fastenal SPA-style Contract File — has extra metadata-looking headers
// =========================================================================
// Simulates how Fastenal sends their SPA files with: Supplier P/N + Agreement Price
// User maps: "Supplier P/N" → Item Number, "Agreement Price" → Price

const fasContract = [
  { 'Supplier P/N': '0304-C-04', 'Fastenal P/N': 'FAS-030404', 'Item Description': 'O-Ring Seal 1/4"', 'Deviated UOM': 'Each', 'Standard Price': 0.60, 'Agreement Price': 0.32 },
  { 'Supplier P/N': '0304-C-06', 'Fastenal P/N': 'FAS-030406', 'Item Description': 'O-Ring Seal 3/8"', 'Deviated UOM': 'Each', 'Standard Price': 0.75, 'Agreement Price': 0.40 },
  { 'Supplier P/N': '0304-C-08', 'Fastenal P/N': 'FAS-030408', 'Item Description': 'O-Ring Seal 1/2"', 'Deviated UOM': 'Each', 'Standard Price': 1.00, 'Agreement Price': 0.55 },
  { 'Supplier P/N': '0305-B-08', 'Fastenal P/N': 'FAS-030508', 'Item Description': 'O-Ring Seal 1/2" Alt', 'Deviated UOM': 'Each', 'Standard Price': 0.90, 'Agreement Price': 0.48 },
  { 'Supplier P/N': '1100-C-12', 'Fastenal P/N': 'FAS-110012', 'Item Description': 'Hydraulic Fitting 3/4"', 'Deviated UOM': 'Each', 'Standard Price': 2.50, 'Agreement Price': 1.25 },
  { 'Supplier P/N': '1100-D-16', 'Fastenal P/N': 'FAS-110016', 'Item Description': 'Hydraulic Fitting 1"', 'Deviated UOM': 'Each', 'Standard Price': 3.20, 'Agreement Price': 1.55 },
  { 'Supplier P/N': '2403-12-12', 'Fastenal P/N': 'FAS-240312', 'Item Description': 'OSW Adapter 3/4"x3/4"', 'Deviated UOM': 'Each', 'Standard Price': 3.80, 'Agreement Price': 1.95 },
  { 'Supplier P/N': '2403-16-16', 'Fastenal P/N': 'FAS-240316', 'Item Description': 'OSW Adapter 1"x1"', 'Deviated UOM': 'Each', 'Standard Price': 5.00, 'Agreement Price': 2.50 },
];

writeFile(fasContract, 'SPA Items', 'fas-spa-bayshore-2026.xlsx');

// =========================================================================
// 3. Fastenal Claim File — Feb 2026 monthly claim
// =========================================================================
// Uses FAS column mapping headers (Contract ID, Vendor Item, Date, etc.)
// References contract 101700 (FAS/Link-Belt, plan OSW)
// Mix of clean matches + exceptions

const fasClaim = [
  // --- 5 CLEAN MATCHES — correct prices from contract 101700/OSW ---
  {
    'Order no': 'FAS-2026-88001',
    'Date': '2/3/2026',
    'Customer': 'LB-PLANT-001',
    'Name': 'LINK-BELT LEXINGTON PLANT',
    'Contract ID': '101700',
    'Item': 'FAS-030404',
    'Vendor Item': '0304-C-04',
    'Vendor': 'BRENNAN INDUSTRIES',
    'Description': 'O-Ring Seal 1/4"',
    'Current Vendor Price': 0.60,
    'Deviated Price': 0.30,
    'QTY': 500,
    'Extended Discount Owed': 150.00,
  },
  {
    'Order no': 'FAS-2026-88002',
    'Date': '2/5/2026',
    'Customer': 'LB-PLANT-001',
    'Name': 'LINK-BELT LEXINGTON PLANT',
    'Contract ID': '101700',
    'Item': 'FAS-030508',
    'Vendor Item': '0305-B-08',
    'Vendor': 'BRENNAN INDUSTRIES',
    'Description': 'O-Ring Seal 1/2"',
    'Current Vendor Price': 0.90,
    'Deviated Price': 0.45,
    'QTY': 300,
    'Extended Discount Owed': 135.00,
  },
  {
    'Order no': 'FAS-2026-88003',
    'Date': '2/8/2026',
    'Customer': 'LB-PLANT-001',
    'Name': 'LINK-BELT LEXINGTON PLANT',
    'Contract ID': '101700',
    'Item': 'FAS-030406',
    'Vendor Item': '0304-C-06',
    'Vendor': 'BRENNAN INDUSTRIES',
    'Description': 'O-Ring Seal 3/8"',
    'Current Vendor Price': 0.75,
    'Deviated Price': 0.37,
    'QTY': 250,
    'Extended Discount Owed': 92.50,
  },
  {
    'Order no': 'FAS-2026-88004',
    'Date': '2/12/2026',
    'Customer': 'LB-PLANT-001',
    'Name': 'LINK-BELT LEXINGTON PLANT',
    'Contract ID': '101700',
    'Item': 'FAS-030408',
    'Vendor Item': '0304-C-08',
    'Vendor': 'BRENNAN INDUSTRIES',
    'Description': 'O-Ring Seal 1/2"',
    'Current Vendor Price': 1.00,
    'Deviated Price': 0.51,
    'QTY': 400,
    'Extended Discount Owed': 196.00,
  },
  {
    'Order no': 'FAS-2026-88005',
    'Date': '2/15/2026',
    'Customer': 'LB-PLANT-001',
    'Name': 'LINK-BELT LEXINGTON PLANT',
    'Contract ID': '101700',
    'Item': 'FAS-240312',
    'Vendor Item': '2403-12-12',
    'Vendor': 'BRENNAN INDUSTRIES',
    'Description': 'OSW Adapter 3/4"x3/4"',
    'Current Vendor Price': 3.80,
    'Deviated Price': 1.88,
    'QTY': 100,
    'Extended Discount Owed': 192.00,
  },

  // --- PRICE MISMATCH (CLM-001) — claims $0.50, contract says $0.71 ---
  {
    'Order no': 'FAS-2026-88010',
    'Date': '2/18/2026',
    'Customer': 'LB-PLANT-001',
    'Name': 'LINK-BELT LEXINGTON PLANT',
    'Contract ID': '101700',
    'Item': 'FAS-030412',
    'Vendor Item': '0304-C-12',
    'Vendor': 'BRENNAN INDUSTRIES',
    'Description': 'O-Ring Seal 3/4"',
    'Current Vendor Price': 1.50,
    'Deviated Price': 0.50,
    'QTY': 200,
    'Extended Discount Owed': 200.00,
  },

  // --- ITEM NOT IN CONTRACT (CLM-003) — 0505-D-12 exists but not on plan OSW ---
  {
    'Order no': 'FAS-2026-88011',
    'Date': '2/19/2026',
    'Customer': 'LB-PLANT-001',
    'Name': 'LINK-BELT LEXINGTON PLANT',
    'Contract ID': '101700',
    'Item': 'FAS-050512',
    'Vendor Item': '0505-D-12',
    'Vendor': 'BRENNAN INDUSTRIES',
    'Description': 'Pipe Fitting 3/4"',
    'Current Vendor Price': 2.10,
    'Deviated Price': 1.05,
    'QTY': 75,
    'Extended Discount Owed': 78.75,
  },

  // --- UNKNOWN ITEM (CLM-006) — item doesn't exist in system ---
  {
    'Order no': 'FAS-2026-88012',
    'Date': '2/20/2026',
    'Customer': 'LB-PLANT-001',
    'Name': 'LINK-BELT LEXINGTON PLANT',
    'Contract ID': '101700',
    'Item': 'FAS-999999',
    'Vendor Item': '9999-X-99',
    'Vendor': 'BRENNAN INDUSTRIES',
    'Description': 'Unknown Widget',
    'Current Vendor Price': 5.00,
    'Deviated Price': 2.50,
    'QTY': 10,
    'Extended Discount Owed': 25.00,
  },

  // --- CONTRACT NOT FOUND (CLM-004) — contract 999999 doesn't exist ---
  {
    'Order no': 'FAS-2026-88015',
    'Date': '2/22/2026',
    'Customer': 'LB-PLANT-001',
    'Name': 'LINK-BELT LEXINGTON PLANT',
    'Contract ID': '999999',
    'Item': 'FAS-030404',
    'Vendor Item': '0304-C-04',
    'Vendor': 'BRENNAN INDUSTRIES',
    'Description': 'O-Ring Seal 1/4"',
    'Current Vendor Price': 0.60,
    'Deviated Price': 0.30,
    'QTY': 100,
    'Extended Discount Owed': 30.00,
  },

  // --- DATE OUTSIDE PERIOD (CLM-002 warning) — March date in Feb claim ---
  {
    'Order no': 'FAS-2026-88020',
    'Date': '3/2/2026',
    'Customer': 'LB-PLANT-001',
    'Name': 'LINK-BELT LEXINGTON PLANT',
    'Contract ID': '101700',
    'Item': 'FAS-030404',
    'Vendor Item': '0304-C-04',
    'Vendor': 'BRENNAN INDUSTRIES',
    'Description': 'O-Ring Seal 1/4"',
    'Current Vendor Price': 0.60,
    'Deviated Price': 0.30,
    'QTY': 50,
    'Extended Discount Owed': 15.00,
  },

  // --- DUPLICATE CLAIM LINE (CLM-009 warning) — same as row 1 ---
  {
    'Order no': 'FAS-2026-88001',
    'Date': '2/3/2026',
    'Customer': 'LB-PLANT-001',
    'Name': 'LINK-BELT LEXINGTON PLANT',
    'Contract ID': '101700',
    'Item': 'FAS-030404',
    'Vendor Item': '0304-C-04',
    'Vendor': 'BRENNAN INDUSTRIES',
    'Description': 'O-Ring Seal 1/4"',
    'Current Vendor Price': 0.60,
    'Deviated Price': 0.30,
    'QTY': 500,
    'Extended Discount Owed': 150.00,
  },
];

writeFile(fasClaim, 'Monthly Claim', 'fas-claim-feb2026.xlsx');

// =========================================================================
// 4. Motion POS File — Feb 2026 Point of Sale report
// =========================================================================
// For cross-referencing against the existing Motion claim file.
// Uses Motion POS format headers.
// Includes:
//   - Some items that match the claim perfectly
//   - One item with lower POS quantity than claimed (CLM-011)
//   - One item with different POS sell price (CLM-012)
//   - One claimed item missing from POS entirely (CLM-010)

const motionPos = [
  // Matches claim row for 6801-08-08-NWO-FG — POS confirms 130 shipped (claim says 120, so OK)
  {
    'MI Loc': '5613',
    'Vendor Part Number': '6801-08-08-NWO-FG',
    'Mfr Part No': '6801-08-08-NWO-FG',
    'Item Description': '1/2" Male JIC x 1/2" Male ORB 90 Elbow',
    'Invoice Date': '02/03/2026',
    'Qty Shipped': 130,
    'Sell Price': 8.50,
    'Ship-to Zip': '40512',
    'City': 'LEXINGTON',
    'State': 'KY',
    'Order Source Desc': 'BRANCH',
  },
  // Matches claim for 6801-12-12-NWO-FG
  {
    'MI Loc': '5613',
    'Vendor Part Number': '6801-12-12-NWO-FG',
    'Mfr Part No': '6801-12-12-NWO-FG',
    'Item Description': '3/4" Male JIC x 3/4" Male ORB 90 Elbow',
    'Invoice Date': '02/05/2026',
    'Qty Shipped': 85,
    'Sell Price': 12.30,
    'Ship-to Zip': '40512',
    'City': 'LEXINGTON',
    'State': 'KY',
    'Order Source Desc': 'BRANCH',
  },
  // Matches claim for 6801-16-16-NWO-FG
  {
    'MI Loc': '5613',
    'Vendor Part Number': '6801-16-16-NWO-FG',
    'Mfr Part No': '6801-16-16-NWO-FG',
    'Item Description': '1" Male JIC x 1" Male ORB 90 Elbow',
    'Invoice Date': '02/07/2026',
    'Qty Shipped': 60,
    'Sell Price': 15.20,
    'Ship-to Zip': '40512',
    'City': 'LEXINGTON',
    'State': 'KY',
    'Order Source Desc': 'BRANCH',
  },
  // Matches 6400-08-08
  {
    'MI Loc': '5613',
    'Vendor Part Number': '6400-08-08',
    'Mfr Part No': '6400-08-08',
    'Item Description': '1/2" Male ORB x 1/2" Male Pipe Adapter',
    'Invoice Date': '02/11/2026',
    'Qty Shipped': 200,
    'Sell Price': 6.75,
    'Ship-to Zip': '40512',
    'City': 'LEXINGTON',
    'State': 'KY',
    'Order Source Desc': 'BRANCH',
  },
  // 6400-12-12 — QUANTITY MISMATCH: POS shows only 100 but claim says 150 (>10% difference → CLM-011)
  {
    'MI Loc': '5613',
    'Vendor Part Number': '6400-12-12',
    'Mfr Part No': '6400-12-12',
    'Item Description': '3/4" Male ORB x 3/4" Male Pipe Adapter',
    'Invoice Date': '02/13/2026',
    'Qty Shipped': 100,
    'Sell Price': 9.80,
    'Ship-to Zip': '40512',
    'City': 'LEXINGTON',
    'State': 'KY',
    'Order Source Desc': 'BRANCH',
  },
  // 6400-16-16 — PRICE MISMATCH: POS sell price $14.00 vs claim $6.00 (CLM-012)
  {
    'MI Loc': '5613',
    'Vendor Part Number': '6400-16-16',
    'Mfr Part No': '6400-16-16',
    'Item Description': '1" Male ORB x 1" Male Pipe Adapter',
    'Invoice Date': '02/14/2026',
    'Qty Shipped': 95,
    'Sell Price': 14.00,
    'Ship-to Zip': '40512',
    'City': 'LEXINGTON',
    'State': 'KY',
    'Order Source Desc': 'BRANCH',
  },
  // 6502-12-12 — matches claim
  {
    'MI Loc': '5613',
    'Vendor Part Number': '6502-12-12',
    'Mfr Part No': '6502-12-12',
    'Item Description': '3/4" Female JIC Swivel x 3/4" Male ORB',
    'Invoice Date': '02/18/2026',
    'Qty Shipped': 50,
    'Sell Price': 16.40,
    'Ship-to Zip': '40512',
    'City': 'LEXINGTON',
    'State': 'KY',
    'Order Source Desc': 'BRANCH',
  },
  // NOTE: 6502-16-16 is NOT in POS — claim says 30 shipped but POS has no record (CLM-010)
  // NOTE: 7700-20-20-NWO-FG from claim is also not in POS (CLM-010, but already has CLM-006 unknown item)
];

writeFile(motionPos, 'POS Report', 'motion-pos-feb2026.xlsx');

// =========================================================================
// 5. Fastenal POS File — Feb 2026
// =========================================================================
// For cross-referencing against the Fastenal claim file.
// Uses Fastenal POS format headers.

const fasPos = [
  // Matches claim for 0304-C-04
  {
    'Vendor Part#': '0304-C-04',
    'Ship Date': '02/03/2026',
    'Qty Std': 520,
    'Sell Price': 0.60,
    'Global ID': 'LB-PLANT-001',
    'Customer Name': 'LINK-BELT LEXINGTON PLANT',
    'Order No': 'FAS-2026-88001',
  },
  // Matches claim for 0305-B-08
  {
    'Vendor Part#': '0305-B-08',
    'Ship Date': '02/05/2026',
    'Qty Std': 300,
    'Sell Price': 0.90,
    'Global ID': 'LB-PLANT-001',
    'Customer Name': 'LINK-BELT LEXINGTON PLANT',
    'Order No': 'FAS-2026-88002',
  },
  // 0304-C-06 — matches
  {
    'Vendor Part#': '0304-C-06',
    'Ship Date': '02/08/2026',
    'Qty Std': 260,
    'Sell Price': 0.75,
    'Global ID': 'LB-PLANT-001',
    'Customer Name': 'LINK-BELT LEXINGTON PLANT',
    'Order No': 'FAS-2026-88003',
  },
  // 0304-C-08 — matches
  {
    'Vendor Part#': '0304-C-08',
    'Ship Date': '02/12/2026',
    'Qty Std': 400,
    'Sell Price': 1.00,
    'Global ID': 'LB-PLANT-001',
    'Customer Name': 'LINK-BELT LEXINGTON PLANT',
    'Order No': 'FAS-2026-88004',
  },
  // 2403-12-12 — matches
  {
    'Vendor Part#': '2403-12-12',
    'Ship Date': '02/15/2026',
    'Qty Std': 100,
    'Sell Price': 3.80,
    'Global ID': 'LB-PLANT-001',
    'Customer Name': 'LINK-BELT LEXINGTON PLANT',
    'Order No': 'FAS-2026-88005',
  },
  // 0304-C-12 — QUANTITY MISMATCH: POS shows 120 but claim says 200 (CLM-011)
  {
    'Vendor Part#': '0304-C-12',
    'Ship Date': '02/18/2026',
    'Qty Std': 120,
    'Sell Price': 1.50,
    'Global ID': 'LB-PLANT-001',
    'Customer Name': 'LINK-BELT LEXINGTON PLANT',
    'Order No': 'FAS-2026-88010',
  },
  // NOTE: 0505-D-12 is NOT in POS at all (CLM-010)
  // NOTE: 9999-X-99 is NOT in POS (CLM-010, but already CLM-006)
];

writeFile(fasPos, 'POS Report', 'fas-pos-feb2026.xlsx');

// =========================================================================
// 6. Simple Motion Contract File — 2-column, dead simple
// =========================================================================
// For testing the simplest case in column mapping (ITEM_NUMBER + Motion Net)

const motionSimpleContract = [
  { 'ITEM_NUMBER': '0304-C-02', 'Motion Net': 0.74 },
  { 'ITEM_NUMBER': '0304-C-02-B', 'Motion Net': 0.70 },
  { 'ITEM_NUMBER': '0304-C-02-SS', 'Motion Net': 2.96 },
  { 'ITEM_NUMBER': '0304-C-04', 'Motion Net': 0.30 },
  { 'ITEM_NUMBER': '0304-C-06', 'Motion Net': 0.38 },
  { 'ITEM_NUMBER': '0304-C-08', 'Motion Net': 0.52 },
  { 'ITEM_NUMBER': '0304-C-12', 'Motion Net': 0.72 },
  { 'ITEM_NUMBER': '0304-C-16', 'Motion Net': 0.95 },
  { 'ITEM_NUMBER': '0304-C-20', 'Motion Net': 1.28 },
  { 'ITEM_NUMBER': '0304-C-24', 'Motion Net': 1.85 },
  { 'ITEM_NUMBER': '0304-C-32', 'Motion Net': 3.42 },
  { 'ITEM_NUMBER': '0305-B-04', 'Motion Net': 0.35 },
  { 'ITEM_NUMBER': '0305-B-06', 'Motion Net': 0.38 },
  { 'ITEM_NUMBER': '0305-B-08', 'Motion Net': 0.48 },
  { 'ITEM_NUMBER': '0305-B-12', 'Motion Net': 0.75 },
];

writeFile(motionSimpleContract, 'Price List', 'motion-contract-linkbelt-2026.xlsx');

// =========================================================================
// Summary
// =========================================================================

console.log('\n=== Test Data Generated ===\n');

console.log('📁 Files created in public/test-data/:\n');

console.log('CONTRACT FILES (for Create Contract page):');
console.log('  1. ait-contract-104040.xlsx');
console.log('     → Tests column mapping: "Part Number" + "7/8 Price" (with extra columns)');
console.log('     → Use: Distributor=AIT, End User=create "QRS" / "Quality Railcar Solutions"');
console.log('     → Start Date: 2026-01-01, Plan Code: QRS');
console.log('     → 10 line items, some items already exist (0304-C-08, 6801-08-08-NWO-FG, etc.)');
console.log('');
console.log('  2. fas-spa-bayshore-2026.xlsx');
console.log('     → Tests column mapping: "Supplier P/N" + "Agreement Price" (with 4 extra columns)');
console.log('     → Use: Distributor=FAS, End User=create "BAYSHORE" / "Bayshore"');
console.log('     → Start Date: 2026-01-01, Plan Code: SPA');
console.log('     → 8 line items');
console.log('');
console.log('  3. motion-contract-linkbelt-2026.xlsx');
console.log('     → Tests simple 2-column: "ITEM_NUMBER" + "Motion Net"');
console.log('     → Use: Distributor=MOTION, End User=LINK-BELT');
console.log('     → Start Date: 2026-01-01, Plan Code: OSW');
console.log('     → 15 line items');
console.log('');

console.log('CLAIM FILES (for Reconciliation → Upload Claim):');
console.log('  4. fas-claim-feb2026.xlsx');
console.log('     → Distributor: FAS (Fastenal), Period: 2026-02');
console.log('     → 11 rows total:');
console.log('       5 clean matches (contract 101700, OSW prices match)');
console.log('       1 price mismatch (CLM-001): 0304-C-12 claims $0.50, contract says $0.71');
console.log('       1 item not in contract (CLM-003): 0505-D-12 exists but not on plan OSW');
console.log('       1 unknown item (CLM-006): 9999-X-99 not in system');
console.log('       1 contract not found (CLM-004): contract 999999');
console.log('       1 date outside period (CLM-002): March date in Feb claim');
console.log('       1 duplicate line (CLM-009): repeat of row 1');
console.log('');

console.log('  5. public/sample-motion-claim-feb2026.xlsx (already exists)');
console.log('     → Distributor: MOTION, Period: 2026-02');
console.log('     → 12 rows with various exception types');
console.log('');

console.log('POS FILES (for Reconciliation → + Add POS on a run):');
console.log('  6. motion-pos-feb2026.xlsx');
console.log('     → Attach to MOTION Feb 2026 run after claim upload');
console.log('     → 7 POS rows. After validation expect:');
console.log('       CLM-010 (No POS Match): 6502-16-16 claimed but not in POS');
console.log('       CLM-011 (Qty Mismatch): 6400-12-12 claim=150 vs POS=100');
console.log('       CLM-012 (Price Mismatch): 6400-16-16 claim=$6.00 vs POS=$14.00');
console.log('');
console.log('  7. fas-pos-feb2026.xlsx');
console.log('     → Attach to FAS Feb 2026 run after claim upload');
console.log('     → 6 POS rows. After validation expect:');
console.log('       CLM-010 (No POS Match): 0505-D-12 claimed but not in POS');
console.log('       CLM-011 (Qty Mismatch): 0304-C-12 claim=200 vs POS=120');
console.log('');

console.log('=== SUGGESTED TEST WORKFLOW ===\n');
console.log('1. Login as jwood / manager123');
console.log('2. Create Contract → Upload the AIT file → map "Part Number" + "7/8 Price" → Preview → Create');
console.log('3. Create Contract → Upload the Fastenal SPA file → map "Supplier P/N" + "Agreement Price" → Preview → Create');
console.log('4. Reconciliation → Upload fas-claim-feb2026.xlsx as FAS / 2026-02');
console.log('5. Click Validate → Review exceptions (should see CLM-001, CLM-003, CLM-004, CLM-006, CLM-002, CLM-009)');
console.log('6. Click + Add POS → Upload fas-pos-feb2026.xlsx');
console.log('7. Click Re-validate → Should now also see CLM-010, CLM-011 POS warnings');
console.log('8. Review → Approve/Reject/Dismiss individual exceptions');
console.log('9. Repeat steps 4-8 with the Motion claim + POS files');
console.log('10. Check Records page → see the contracts created in steps 2-3');
console.log('11. Check Audit Log → see all create/update events');
