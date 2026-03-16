// Generate a sample Motion Industries claim file for testing reconciliation.
// Run: npx tsx scripts/generate-sample-claim.ts
// Output: public/sample-motion-claim-feb2026.xlsx
//
// Simulates Motion submitting their February 2026 monthly rebate claim
// for items sold under contract 102450 (Komatsu end user).
// Mix of clean matches + various exception types for testing.

import * as XLSX from 'xlsx';
import * as path from 'path';

// Motion uses different column names than Fastenal (see column-mappings.ts)
const rows = [
  // --- 7 CLEAN MATCHES — prices match contract 102450, plan MHF ---
  {
    'Purchase Order #': 'PO-2026-44501',
    'Ship Date': '2/3/2026',
    'End User ID': 'KOM-EAST-001',
    'End User Name': 'KOMATSU MINING - EAST',
    'Brennan Contract #': '102450',
    'Motion PN': 'MOT-6801-0808',
    'Brennan PN': '6801-08-08-NWO-FG',
    'Part Description': '1/2" Male JIC x 1/2" Male ORB 90 Elbow',
    'List Price': 8.50,
    'Special Price': 3.80,
    'Qty Shipped': 120,
    'Rebate Amount': 564.00,
  },
  {
    'Purchase Order #': 'PO-2026-44502',
    'Ship Date': '2/5/2026',
    'End User ID': 'KOM-EAST-001',
    'End User Name': 'KOMATSU MINING - EAST',
    'Brennan Contract #': '102450',
    'Motion PN': 'MOT-6801-1212',
    'Brennan PN': '6801-12-12-NWO-FG',
    'Part Description': '3/4" Male JIC x 3/4" Male ORB 90 Elbow',
    'List Price': 12.30,
    'Special Price': 5.52,
    'Qty Shipped': 80,
    'Rebate Amount': 542.40,
  },
  {
    'Purchase Order #': 'PO-2026-44503',
    'Ship Date': '2/7/2026',
    'End User ID': 'KOM-EAST-001',
    'End User Name': 'KOMATSU MINING - EAST',
    'Brennan Contract #': '102450',
    'Motion PN': 'MOT-6801-1616',
    'Brennan PN': '6801-16-16-NWO-FG',
    'Part Description': '1" Male JIC x 1" Male ORB 90 Elbow',
    'List Price': 15.20,
    'Special Price': 6.65,
    'Qty Shipped': 60,
    'Rebate Amount': 513.00,
  },
  {
    'Purchase Order #': 'PO-2026-44510',
    'Ship Date': '2/11/2026',
    'End User ID': 'KOM-EAST-001',
    'End User Name': 'KOMATSU MINING - EAST',
    'Brennan Contract #': '102450',
    'Motion PN': 'MOT-6400-0808',
    'Brennan PN': '6400-08-08',
    'Part Description': '1/2" Male ORB x 1/2" Male Pipe Adapter',
    'List Price': 6.75,
    'Special Price': 2.90,
    'Qty Shipped': 200,
    'Rebate Amount': 770.00,
  },
  {
    'Purchase Order #': 'PO-2026-44511',
    'Ship Date': '2/13/2026',
    'End User ID': 'KOM-EAST-001',
    'End User Name': 'KOMATSU MINING - EAST',
    'Brennan Contract #': '102450',
    'Motion PN': 'MOT-6400-1212',
    'Brennan PN': '6400-12-12',
    'Part Description': '3/4" Male ORB x 3/4" Male Pipe Adapter',
    'List Price': 9.80,
    'Special Price': 4.25,
    'Qty Shipped': 150,
    'Rebate Amount': 832.50,
  },
  {
    'Purchase Order #': 'PO-2026-44515',
    'Ship Date': '2/18/2026',
    'End User ID': 'KOM-EAST-001',
    'End User Name': 'KOMATSU MINING - EAST',
    'Brennan Contract #': '102450',
    'Motion PN': 'MOT-6502-1212',
    'Brennan PN': '6502-12-12',
    'Part Description': '3/4" Female JIC Swivel x 3/4" Male ORB',
    'List Price': 16.40,
    'Special Price': 7.10,
    'Qty Shipped': 45,
    'Rebate Amount': 418.50,
  },
  {
    'Purchase Order #': 'PO-2026-44516',
    'Ship Date': '2/20/2026',
    'End User ID': 'KOM-EAST-001',
    'End User Name': 'KOMATSU MINING - EAST',
    'Brennan Contract #': '102450',
    'Motion PN': 'MOT-6502-1616',
    'Brennan PN': '6502-16-16',
    'Part Description': '1" Female JIC Swivel x 1" Male ORB',
    'List Price': 21.50,
    'Special Price': 9.45,
    'Qty Shipped': 30,
    'Rebate Amount': 361.50,
  },

  // --- PRICE MISMATCH (CLM-001) — claims $6.00 but contract says $5.80 ---
  {
    'Purchase Order #': 'PO-2026-44512',
    'Ship Date': '2/14/2026',
    'End User ID': 'KOM-EAST-001',
    'End User Name': 'KOMATSU MINING - EAST',
    'Brennan Contract #': '102450',
    'Motion PN': 'MOT-6400-1616',
    'Brennan PN': '6400-16-16',
    'Part Description': '1" Male ORB x 1" Male Pipe Adapter',
    'List Price': 13.50,
    'Special Price': 6.00,
    'Qty Shipped': 90,
    'Rebate Amount': 675.00,
  },

  // --- UNKNOWN ITEM (CLM-006) — Brennan PN doesn't exist ---
  {
    'Purchase Order #': 'PO-2026-44520',
    'Ship Date': '2/22/2026',
    'End User ID': 'KOM-EAST-001',
    'End User Name': 'KOMATSU MINING - EAST',
    'Brennan Contract #': '102450',
    'Motion PN': 'MOT-NEW-ITEM',
    'Brennan PN': '7700-20-20-NWO-FG',
    'Part Description': '1-1/4" New Fitting Not Yet In System',
    'List Price': 28.00,
    'Special Price': 14.50,
    'Qty Shipped': 15,
    'Rebate Amount': 202.50,
  },

  // --- CONTRACT NOT FOUND (CLM-004) — contract 888888 doesn't exist ---
  {
    'Purchase Order #': 'PO-2026-44525',
    'Ship Date': '2/24/2026',
    'End User ID': 'KOM-EAST-001',
    'End User Name': 'KOMATSU MINING - EAST',
    'Brennan Contract #': '888888',
    'Motion PN': 'MOT-6801-1212',
    'Brennan PN': '6801-12-12-NWO-FG',
    'Part Description': '3/4" Male JIC x 3/4" Male ORB 90 Elbow',
    'List Price': 12.30,
    'Special Price': 5.52,
    'Qty Shipped': 25,
    'Rebate Amount': 169.50,
  },

  // --- EXPIRED CONTRACT (CLM-007) — contract 102100 expired 12/31/2025 ---
  {
    'Purchase Order #': 'PO-2026-44530',
    'Ship Date': '2/25/2026',
    'End User ID': 'DEERE-MW-001',
    'End User Name': 'JOHN DEERE - MIDWEST',
    'Brennan Contract #': '102100',
    'Motion PN': 'MOT-2200-A08',
    'Brennan PN': '2200-A-08',
    'Part Description': 'Ball Bearing 1/2"',
    'List Price': 1.80,
    'Special Price': 0.65,
    'Qty Shipped': 500,
    'Rebate Amount': 575.00,
  },

  // --- DATE OUTSIDE PERIOD (warning) — January date in a February claim ---
  {
    'Purchase Order #': 'PO-2026-43999',
    'Ship Date': '1/29/2026',
    'End User ID': 'KOM-EAST-001',
    'End User Name': 'KOMATSU MINING - EAST',
    'Brennan Contract #': '102450',
    'Motion PN': 'MOT-6801-0808',
    'Brennan PN': '6801-08-08-NWO-FG',
    'Part Description': '1/2" Male JIC x 1/2" Male ORB 90 Elbow',
    'List Price': 8.50,
    'Special Price': 3.80,
    'Qty Shipped': 40,
    'Rebate Amount': 188.00,
  },
];

const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Monthly Rebate Claim');

const colWidths = Object.keys(rows[0]).map(key => ({
  wch: Math.max(key.length, ...rows.map(r => String((r as Record<string, unknown>)[key] ?? '').length)) + 2
}));
ws['!cols'] = colWidths;

const outputPath = path.join(process.cwd(), 'public', 'sample-motion-claim-feb2026.xlsx');
XLSX.writeFile(wb, outputPath);

console.log(`\nSample Motion claim file generated: ${outputPath}`);
console.log(`  Total rows: ${rows.length}`);
console.log('');
console.log('  Upload in Reconciliation page as:');
console.log('    Distributor: MOTION — Motion Industries');
console.log('    Claim Period: 2026-02');
console.log('');
console.log('  Expected results:');
console.log('    7 clean matches');
console.log('    1 price mismatch: 6400-16-16 claims $6.00, contract says $5.80');
console.log('    1 unknown item: 7700-20-20-NWO-FG not in system');
console.log('    1 contract not found: contract 888888');
console.log('    1 expired contract: contract 102100 expired 12/31/2025');
console.log('    1 date outside period: Jan 29 in a Feb claim');
