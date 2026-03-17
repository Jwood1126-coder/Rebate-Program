// Generate a sample contract request Excel file for testing the upload workflow.
// Usage: npx tsx scripts/generate-sample-contract.ts

import * as XLSX from 'xlsx';
import * as path from 'path';

const rows = [
  // MOTION / LINK-BELT contract — 8 items, OSW plan
  { "Distributor Code": "MOTION", "End User Code": "LINK-BELT", "End User Name": "Link-Belt Bearings", "Plan Code": "OSW", "Item Number": "0304-C-04", "Deviated Price": 0.30, "Start Date": "01/01/2026", "End Date": "12/31/2026" },
  { "Distributor Code": "MOTION", "End User Code": "LINK-BELT", "End User Name": "Link-Belt Bearings", "Plan Code": "OSW", "Item Number": "0400-C-08", "Deviated Price": 0.65, "Start Date": "01/01/2026", "End Date": "12/31/2026" },
  { "Distributor Code": "MOTION", "End User Code": "LINK-BELT", "End User Name": "Link-Belt Bearings", "Plan Code": "OSW", "Item Number": "1600-08-08", "Deviated Price": 2.78, "Start Date": "01/01/2026", "End Date": "12/31/2026" },
  { "Distributor Code": "MOTION", "End User Code": "LINK-BELT", "End User Name": "Link-Belt Bearings", "Plan Code": "OSW", "Item Number": "2000-08-06", "Deviated Price": 1.90, "Start Date": "01/01/2026", "End Date": "12/31/2026" },
  { "Distributor Code": "MOTION", "End User Code": "LINK-BELT", "End User Name": "Link-Belt Bearings", "Plan Code": "OSW", "Item Number": "2503-06-06", "Deviated Price": 4.75, "Start Date": "01/01/2026", "End Date": "12/31/2026" },
  { "Distributor Code": "MOTION", "End User Code": "LINK-BELT", "End User Name": "Link-Belt Bearings", "Plan Code": "OSW", "Item Number": "6400-08-08", "Deviated Price": 3.40, "Start Date": "01/01/2026", "End Date": "12/31/2026" },
  { "Distributor Code": "MOTION", "End User Code": "LINK-BELT", "End User Name": "Link-Belt Bearings", "Plan Code": "OSW", "Item Number": "6400-12-12", "Deviated Price": 4.10, "Start Date": "01/01/2026", "End Date": "12/31/2026" },
  { "Distributor Code": "MOTION", "End User Code": "LINK-BELT", "End User Name": "Link-Belt Bearings", "Plan Code": "OSW", "Item Number": "6400-16-16", "Deviated Price": 5.80, "Start Date": "01/01/2026", "End Date": "12/31/2026" },

  // MOTION / CAT contract — 4 items, HYD plan
  { "Distributor Code": "MOTION", "End User Code": "CAT", "End User Name": "Caterpillar Inc.", "Plan Code": "HYD", "Item Number": "1600-08-08", "Deviated Price": 2.50, "Start Date": "01/01/2026", "End Date": "12/31/2026" },
  { "Distributor Code": "MOTION", "End User Code": "CAT", "End User Name": "Caterpillar Inc.", "Plan Code": "HYD", "Item Number": "2000-08-06", "Deviated Price": 1.75, "Start Date": "01/01/2026", "End Date": "12/31/2026" },
  { "Distributor Code": "MOTION", "End User Code": "CAT", "End User Name": "Caterpillar Inc.", "Plan Code": "HYD", "Item Number": "6400-08-08", "Deviated Price": 3.20, "Start Date": "01/01/2026", "End Date": "12/31/2026" },
  { "Distributor Code": "MOTION", "End User Code": "CAT", "End User Name": "Caterpillar Inc.", "Plan Code": "HYD", "Item Number": "6400-12-12", "Deviated Price": 3.90, "Start Date": "01/01/2026", "End Date": "12/31/2026" },
];

const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Contract Request");

const outPath = path.join(process.cwd(), "public", "sample-motion-contract-2026.xlsx");
XLSX.writeFile(wb, outPath);

console.log(`Sample contract file written to: ${outPath}`);
console.log(`${rows.length} line items across 2 contracts (MOTION/LINK-BELT, MOTION/CAT)`);
