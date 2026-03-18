/**
 * Generate POS test data files for March 2026 runs.
 * Each distributor has its own column format matching their column mapping.
 *
 * Run: npx tsx scripts/generate-pos-data-2026-03-17.ts
 */
import * as XLSX from 'xlsx';
import path from 'path';

const outDir = path.join(process.cwd(), 'public', 'test-data');

function writeXlsx(filename: string, sheetName: string, rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, path.join(outDir, filename));
  console.log(`  ✓ ${filename} (${rows.length} rows)`);
}

console.log('Generating POS files (2026-03-17)...\n');

// ============================================================================
// FAS POS — March 2026 (Fastenal format)
// Some items match claim, some don't (CLM-010), some have qty mismatch (CLM-011),
// some have price mismatch (CLM-012)
// ============================================================================
writeXlsx('fas-pos-mar2026.xlsx', 'POS', [
  // Matches claim rows
  { 'Vendor Part#': '0304-C-04', 'Ship Date': '03/03/2026', 'Qty Std': 100, 'Sell Price': 0.60, 'Global ID': 'LB-PLANT-001', 'Customer Name': 'LINK-BELT LEXINGTON PLANT', 'Order No': 'FAS-2026-90001' },
  { 'Vendor Part#': '0304-C-06', 'Ship Date': '03/05/2026', 'Qty Std': 80, 'Sell Price': 0.74, 'Global ID': 'LB-PLANT-001', 'Customer Name': 'LINK-BELT LEXINGTON PLANT', 'Order No': 'FAS-2026-90002' },
  { 'Vendor Part#': '0304-C-08', 'Ship Date': '03/08/2026', 'Qty Std': 60, 'Sell Price': 1.02, 'Global ID': 'LB-PLANT-002', 'Customer Name': 'LINK-BELT SUMTER PLANT', 'Order No': 'FAS-2026-90003' },
  { 'Vendor Part#': '0305-B-08', 'Ship Date': '03/10/2026', 'Qty Std': 75, 'Sell Price': 0.90, 'Global ID': 'LB-PLANT-001', 'Customer Name': 'LINK-BELT LEXINGTON PLANT', 'Order No': 'FAS-2026-90004' },
  { 'Vendor Part#': '1700-16-16', 'Ship Date': '03/12/2026', 'Qty Std': 10, 'Sell Price': 18.60, 'Global ID': 'LB-PLANT-001', 'Customer Name': 'LINK-BELT LEXINGTON PLANT', 'Order No': 'FAS-2026-90005' },
  // CLM-011: qty mismatch — claim says 40, POS says 35
  { 'Vendor Part#': '2403-16-16', 'Ship Date': '03/15/2026', 'Qty Std': 35, 'Sell Price': 4.86, 'Global ID': 'LB-PLANT-001', 'Customer Name': 'LINK-BELT LEXINGTON PLANT', 'Order No': 'FAS-2026-90006' },
  // Extra POS row not in claim (CLM-010 on claim side = no matching POS)
  { 'Vendor Part#': '2404-06-06', 'Ship Date': '03/20/2026', 'Qty Std': 50, 'Sell Price': 1.48, 'Global ID': 'LB-PLANT-002', 'Customer Name': 'LINK-BELT SUMTER PLANT', 'Order No': 'FAS-2026-90007' },
]);

// ============================================================================
// MOTION POS — March 2026 (Motion Industries format)
// ============================================================================
writeXlsx('motion-pos-mar2026.xlsx', 'POS', [
  { 'MI Loc': '5613', 'Vendor Part Number': '6801-08-08-NWO-FG', 'Mfr Part No': '6801-08-08-NWO-FG', 'Item Description': '1/2" Male JIC x 1/2" Male ORB 90 Elbow', 'Invoice Date': '03/02/2026', 'Qty Shipped': 25, 'Sell Price': 7.60, 'Ship-to Zip': '40512', 'City': 'LEXINGTON', 'State': 'KY', 'Order Source Desc': 'BRANCH' },
  { 'MI Loc': '5613', 'Vendor Part Number': '6801-12-12-NWO-FG', 'Mfr Part No': '6801-12-12-NWO-FG', 'Item Description': '3/4" Male JIC x 3/4" Male ORB 90 Elbow', 'Invoice Date': '03/05/2026', 'Qty Shipped': 18, 'Sell Price': 11.04, 'Ship-to Zip': '40512', 'City': 'LEXINGTON', 'State': 'KY', 'Order Source Desc': 'BRANCH' },
  { 'MI Loc': '5613', 'Vendor Part Number': '6400-08-08', 'Mfr Part No': '6400-08-08', 'Item Description': '1/2" Male ORB x 1/2" Male Pipe Adapter', 'Invoice Date': '03/08/2026', 'Qty Shipped': 30, 'Sell Price': 5.80, 'Ship-to Zip': '37920', 'City': 'KNOXVILLE', 'State': 'TN', 'Order Source Desc': 'ECOMM' },
  { 'MI Loc': '5820', 'Vendor Part Number': '6400-16-16', 'Mfr Part No': '6400-16-16', 'Item Description': '1" Male ORB x 1" Male Pipe Adapter', 'Invoice Date': '03/11/2026', 'Qty Shipped': 12, 'Sell Price': 11.60, 'Ship-to Zip': '37920', 'City': 'KNOXVILLE', 'State': 'TN', 'Order Source Desc': 'BRANCH' },
  { 'MI Loc': '5613', 'Vendor Part Number': '6502-12-12', 'Mfr Part No': '6502-12-12', 'Item Description': '3/4" Female JIC Swivel x 3/4" Male ORB', 'Invoice Date': '03/14/2026', 'Qty Shipped': 10, 'Sell Price': 14.20, 'Ship-to Zip': '40512', 'City': 'LEXINGTON', 'State': 'KY', 'Order Source Desc': 'BRANCH' },
  // CLM-012: POS price mismatch (claim deviated 4.25, POS sell 7.80 — but contract is 3.80)
  { 'MI Loc': '5613', 'Vendor Part Number': '6801-08-08-NWO-FG', 'Mfr Part No': '6801-08-08-NWO-FG', 'Item Description': '1/2" Male JIC x 1/2" Male ORB 90 Elbow', 'Invoice Date': '03/17/2026', 'Qty Shipped': 20, 'Sell Price': 7.80, 'Ship-to Zip': '40512', 'City': 'LEXINGTON', 'State': 'KY', 'Order Source Desc': 'BRANCH' },
]);

// ============================================================================
// HSC POS — March 2026 (generic format)
// ============================================================================
writeXlsx('hsc-pos-mar2026.xlsx', 'POS', [
  { 'Part Number': '6800-08-08', 'Transaction Date': '03/05/2026', 'Quantity': 20, 'Sell Price': 6.30, 'End User': 'VOLVO', 'Order Number': 'HSC-90001' },
  { 'Part Number': '6800-12-12', 'Transaction Date': '03/07/2026', 'Quantity': 15, 'Sell Price': 9.80, 'End User': 'VOLVO', 'Order Number': 'HSC-90002' },
  { 'Part Number': '6800-16-16', 'Transaction Date': '03/10/2026', 'Quantity': 10, 'Sell Price': 13.50, 'End User': 'VOLVO', 'Order Number': 'HSC-90003' },
  { 'Part Number': '6800-20-20', 'Transaction Date': '03/12/2026', 'Quantity': 8, 'Sell Price': 18.80, 'End User': 'VOLVO', 'Order Number': 'HSC-90004' },
  { 'Part Number': '6800-04-04', 'Transaction Date': '03/15/2026', 'Quantity': 50, 'Sell Price': 3.70, 'End User': 'VOLVO', 'Order Number': 'HSC-90005' },
  // CLM-011: qty mismatch — claim says 30, POS says 22
  { 'Part Number': '6800-08-08', 'Transaction Date': '03/18/2026', 'Quantity': 22, 'Sell Price': 6.30, 'End User': 'VOLVO', 'Order Number': 'HSC-90006' },
]);

// ============================================================================
// AIT POS — March 2026
// ============================================================================
writeXlsx('ait-pos-mar2026.xlsx', 'POS', [
  { 'Item': 'SS-0404', 'Trans Date': '03/03/2026', 'Quantity': 25, 'Sell Price': 4.20, 'End User Code': 'KUBOTA', 'Order #': 'AIT-90001' },
  { 'Item': 'SS-0808', 'Trans Date': '03/06/2026', 'Quantity': 20, 'Sell Price': 6.90, 'End User Code': 'KUBOTA', 'Order #': 'AIT-90002' },
  { 'Item': 'SS-1212', 'Trans Date': '03/09/2026', 'Quantity': 12, 'Sell Price': 10.40, 'End User Code': 'KUBOTA', 'Order #': 'AIT-90003' },
  { 'Item': 'SS-1616', 'Trans Date': '03/12/2026', 'Quantity': 8, 'Sell Price': 15.60, 'End User Code': 'KUBOTA', 'Order #': 'AIT-90004' },
  // CLM-011: qty off (claim 15, POS 12)
  { 'Item': 'SS-0808', 'Trans Date': '03/15/2026', 'Quantity': 12, 'Sell Price': 6.90, 'End User Code': 'KUBOTA', 'Order #': 'AIT-90005' },
]);

// ============================================================================
// LGG POS — March 2026
// ============================================================================
writeXlsx('lgg-pos-mar2026.xlsx', 'POS', [
  { 'Part Number': '4400-08-08', 'Transaction Date': '03/04/2026', 'Quantity': 30, 'Sell Price': 9.00, 'End User': 'DEERE', 'Order Number': 'LGG-90001' },
  { 'Part Number': '4400-12-12', 'Transaction Date': '03/08/2026', 'Quantity': 20, 'Sell Price': 12.40, 'End User': 'DEERE', 'Order Number': 'LGG-90002' },
  { 'Part Number': '4400-16-16', 'Transaction Date': '03/11/2026', 'Quantity': 15, 'Sell Price': 16.20, 'End User': 'DEERE', 'Order Number': 'LGG-90003' },
  { 'Part Number': '4400-20-20', 'Transaction Date': '03/14/2026', 'Quantity': 10, 'Sell Price': 20.60, 'End User': 'DEERE', 'Order Number': 'LGG-90004' },
]);

// ============================================================================
// TIPCO POS — March 2026
// ============================================================================
writeXlsx('tipco-pos-mar2026.xlsx', 'POS', [
  { 'Part Number': '7000-12', 'Transaction Date': '03/02/2026', 'Quantity': 10, 'Sell Price': 25.00, 'End User': 'VOLVO', 'Order Number': 'TIP-90001' },
  { 'Part Number': '7001-12', 'Transaction Date': '03/06/2026', 'Quantity': 8, 'Sell Price': 29.50, 'End User': 'VOLVO', 'Order Number': 'TIP-90002' },
  { 'Part Number': '7002-12', 'Transaction Date': '03/10/2026', 'Quantity': 12, 'Sell Price': 22.40, 'End User': 'VOLVO', 'Order Number': 'TIP-90003' },
  { 'Part Number': '7000-16', 'Transaction Date': '03/14/2026', 'Quantity': 6, 'Sell Price': 33.80, 'End User': 'VOLVO', 'Order Number': 'TIP-90004' },
  // CLM-012: POS price differs from claim
  { 'Part Number': '7000-12', 'Transaction Date': '03/18/2026', 'Quantity': 10, 'Sell Price': 23.50, 'End User': 'VOLVO', 'Order Number': 'TIP-90005' },
]);

console.log('\nDone. POS files written to public/test-data/');
