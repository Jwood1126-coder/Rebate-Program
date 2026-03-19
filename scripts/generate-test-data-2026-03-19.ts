/**
 * Generate test data files dated 2026-03-19.
 *
 * Produces:
 * - 6 contract files (one per distributor) for uploading via Contracts → New → Upload File
 * - 6 claim files (one per distributor) for uploading via Reconciliation
 * - 6 POS files (one per distributor) for uploading during reconciliation
 * - 2 contract update files for testing the Update Contract workflow
 *
 * Run: npx tsx scripts/generate-test-data-2026-03-19.ts
 */
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const outDir = path.join(process.cwd(), "public", "test-data");

function writeXlsx(
  filename: string,
  sheetName: string,
  rows: Record<string, unknown>[],
) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const filePath = path.join(outDir, filename);
  XLSX.writeFile(wb, filePath);
  console.log(`  ✓ ${filename} (${rows.length} rows)`);
}

console.log("Generating test data files (2026-03-19)...\n");

// ============================================================================
// CONTRACT FILES — upload via Contracts → New → Upload File
// These create the contracts that claim/POS files reference.
// ============================================================================

console.log("--- Contract Files ---");

// FAS / LINK-BELT — Contract 101700
writeXlsx("CONTRACT - Fastenal (LINK-BELT) 2026-03-19.xlsx", "Contract", [
  { "Part Number": "0304-C-04", "Rebate Price": 0.3 },
  { "Part Number": "0304-C-06", "Rebate Price": 0.37 },
  { "Part Number": "0304-C-08", "Rebate Price": 0.51 },
  { "Part Number": "0305-B-08", "Rebate Price": 0.45 },
  { "Part Number": "1700-16-16", "Rebate Price": 9.3 },
  { "Part Number": "2403-16-16", "Rebate Price": 2.43 },
  { "Part Number": "2404-06-06", "Rebate Price": 0.74 },
  { "Part Number": "6400-08-08", "Rebate Price": 2.9 },
]);

// MOTION / KOMATSU — Contract 102450
writeXlsx("CONTRACT - Motion Industries (KOMATSU) 2026-03-19.xlsx", "Contract", [
  { "Part Number": "6801-08-08-NWO-FG", "Rebate Price": 3.8 },
  { "Part Number": "6801-12-12-NWO-FG", "Rebate Price": 5.52 },
  { "Part Number": "6400-08-08", "Rebate Price": 2.9 },
  { "Part Number": "6400-16-16", "Rebate Price": 5.8 },
  { "Part Number": "6502-12-12", "Rebate Price": 7.1 },
  { "Part Number": "6502-16-16", "Rebate Price": 9.25 },
]);

// HSC / VOLVO — Contract 103200
writeXlsx("CONTRACT - HSC Industrial (VOLVO) 2026-03-19.xlsx", "Contract", [
  { "Part Number": "6800-04-04", "Rebate Price": 1.85 },
  { "Part Number": "6800-08-08", "Rebate Price": 3.15 },
  { "Part Number": "6800-12-12", "Rebate Price": 4.9 },
  { "Part Number": "6800-16-16", "Rebate Price": 6.75 },
  { "Part Number": "6800-20-20", "Rebate Price": 9.4 },
]);

// AIT / KUBOTA — Contract 104100
writeXlsx("CONTRACT - AIT Supply (KUBOTA) 2026-03-19.xlsx", "Contract", [
  { "Item Number": "SS-0404", Price: 2.1 },
  { "Item Number": "SS-0808", Price: 3.45 },
  { "Item Number": "SS-1212", Price: 5.2 },
  { "Item Number": "SS-1616", Price: 7.8 },
]);

// LGG / DEERE — Contract 105100
writeXlsx("CONTRACT - LGG Industrial (DEERE) 2026-03-19.xlsx", "Contract", [
  { "Part Number": "4400-08-08", "Rebate Price": 4.5 },
  { "Part Number": "4400-12-12", "Rebate Price": 6.2 },
  { "Part Number": "4400-16-16", "Rebate Price": 8.1 },
  { "Part Number": "4400-20-20", "Rebate Price": 10.3 },
]);

// TIPCO / VOLVO — Contract 106100
writeXlsx("CONTRACT - TIPCO Technologies (VOLVO) 2026-03-19.xlsx", "Contract", [
  { "Item Number": "7000-12", Price: 12.5 },
  { "Item Number": "7001-12", Price: 14.75 },
  { "Item Number": "7002-12", Price: 11.2 },
  { "Item Number": "7000-16", Price: 16.9 },
  { "Item Number": "7001-16", Price: 18.3 },
  { "Item Number": "7002-16", Price: 15.6 },
]);

// ============================================================================
// CLAIM FILES — upload via Reconciliation for March 2026
// Each has: some clean matches, some CLM-001 (price mismatch), some CLM-003/006
// ============================================================================

console.log("\n--- Claim Files (March 2026) ---");

// FAS Claim
writeXlsx("CLAIM - Fastenal Mar2026.xlsx", "Claims", [
  { "Contract #": "101700", "Part Number": "0304-C-04", "Transaction Date": "2026-03-03", "Deviated Price": 0.3, Qty: 100, "Claimed Amount": 30.0, "End User": "LINK-BELT" },
  { "Contract #": "101700", "Part Number": "0304-C-06", "Transaction Date": "2026-03-05", "Deviated Price": 0.37, Qty: 80, "Claimed Amount": 29.6, "End User": "LINK-BELT" },
  { "Contract #": "101700", "Part Number": "0304-C-08", "Transaction Date": "2026-03-08", "Deviated Price": 0.51, Qty: 60, "Claimed Amount": 30.6, "End User": "LINK-BELT" },
  { "Contract #": "101700", "Part Number": "0305-B-08", "Transaction Date": "2026-03-10", "Deviated Price": 0.45, Qty: 75, "Claimed Amount": 33.75, "End User": "LINK-BELT" },
  { "Contract #": "101700", "Part Number": "1700-16-16", "Transaction Date": "2026-03-12", "Deviated Price": 9.3, Qty: 10, "Claimed Amount": 93.0, "End User": "LINK-BELT" },
  { "Contract #": "101700", "Part Number": "2403-16-16", "Transaction Date": "2026-03-15", "Deviated Price": 2.43, Qty: 40, "Claimed Amount": 97.2, "End User": "LINK-BELT" },
  // CLM-001: price mismatch (contract 0.30, claiming 0.35)
  { "Contract #": "101700", "Part Number": "0304-C-04", "Transaction Date": "2026-03-18", "Deviated Price": 0.35, Qty: 50, "Claimed Amount": 17.5, "End User": "LINK-BELT" },
  // CLM-006: unknown item
  { "Contract #": "101700", "Part Number": "NEW-ITEM-2026", "Transaction Date": "2026-03-20", "Deviated Price": 1.5, Qty: 20, "Claimed Amount": 30.0, "End User": "LINK-BELT" },
]);

// MOTION Claim
writeXlsx("CLAIM - Motion Industries Mar2026.xlsx", "Claims", [
  { "Contract #": "102450", "Part Number": "6801-08-08-NWO-FG", "Transaction Date": "2026-03-02", "Deviated Price": 3.8, Qty: 25, "Claimed Amount": 95.0, "End User": "KOMATSU" },
  { "Contract #": "102450", "Part Number": "6801-12-12-NWO-FG", "Transaction Date": "2026-03-05", "Deviated Price": 5.52, Qty: 18, "Claimed Amount": 99.36, "End User": "KOMATSU" },
  { "Contract #": "102450", "Part Number": "6400-08-08", "Transaction Date": "2026-03-08", "Deviated Price": 2.9, Qty: 30, "Claimed Amount": 87.0, "End User": "KOMATSU" },
  { "Contract #": "102450", "Part Number": "6400-16-16", "Transaction Date": "2026-03-11", "Deviated Price": 5.8, Qty: 12, "Claimed Amount": 69.6, "End User": "KOMATSU" },
  { "Contract #": "102450", "Part Number": "6502-12-12", "Transaction Date": "2026-03-14", "Deviated Price": 7.1, Qty: 10, "Claimed Amount": 71.0, "End User": "KOMATSU" },
  // CLM-001: price mismatch (contract 3.80, claiming 4.25)
  { "Contract #": "102450", "Part Number": "6801-08-08-NWO-FG", "Transaction Date": "2026-03-17", "Deviated Price": 4.25, Qty: 20, "Claimed Amount": 85.0, "End User": "KOMATSU" },
  // CLM-003: item not on this contract
  { "Contract #": "102450", "Part Number": "0304-C-04", "Transaction Date": "2026-03-19", "Deviated Price": 0.3, Qty: 50, "Claimed Amount": 15.0, "End User": "KOMATSU" },
]);

// HSC Claim
writeXlsx("CLAIM - HSC Industrial Mar2026.xlsx", "Claims", [
  { "Contract #": "103200", "Part Number": "6800-08-08", "Transaction Date": "2026-03-05", "Deviated Price": 3.15, Qty: 20, "Claimed Amount": 12.0, "End User": "VOLVO" },
  { "Contract #": "103200", "Part Number": "6800-12-12", "Transaction Date": "2026-03-07", "Deviated Price": 4.9, Qty: 15, "Claimed Amount": 10.5, "End User": "VOLVO" },
  { "Contract #": "103200", "Part Number": "6800-16-16", "Transaction Date": "2026-03-10", "Deviated Price": 6.75, Qty: 10, "Claimed Amount": 8.0, "End User": "VOLVO" },
  { "Contract #": "103200", "Part Number": "6800-20-20", "Transaction Date": "2026-03-12", "Deviated Price": 9.4, Qty: 8, "Claimed Amount": 7.2, "End User": "VOLVO" },
  { "Contract #": "103200", "Part Number": "6800-04-04", "Transaction Date": "2026-03-15", "Deviated Price": 1.85, Qty: 50, "Claimed Amount": 25.0, "End User": "VOLVO" },
  // CLM-001: price mismatch (contract 3.15, claiming 2.99)
  { "Contract #": "103200", "Part Number": "6800-08-08", "Transaction Date": "2026-03-18", "Deviated Price": 2.99, Qty: 30, "Claimed Amount": 15.0, "End User": "VOLVO" },
  // CLM-006: completely unknown item
  { "Contract #": "103200", "Part Number": "UNKNOWN-999", "Transaction Date": "2026-03-22", "Deviated Price": 5.5, Qty: 5, "Claimed Amount": 27.5, "End User": "VOLVO" },
]);

// AIT Claim
writeXlsx("CLAIM - AIT Supply Mar2026.xlsx", "Claims", [
  { "Contract Number": "104100", Item: "SS-0404", "Trans Date": "2026-03-03", Price: 2.1, Quantity: 25, Amount: 52.5, "End User Code": "KUBOTA" },
  { "Contract Number": "104100", Item: "SS-0808", "Trans Date": "2026-03-06", Price: 3.45, Quantity: 20, Amount: 69.0, "End User Code": "KUBOTA" },
  { "Contract Number": "104100", Item: "SS-1212", "Trans Date": "2026-03-09", Price: 5.2, Quantity: 12, Amount: 62.4, "End User Code": "KUBOTA" },
  { "Contract Number": "104100", Item: "SS-1616", "Trans Date": "2026-03-12", Price: 7.8, Quantity: 8, Amount: 62.4, "End User Code": "KUBOTA" },
  // CLM-001: price mismatch (contract 3.45, claiming 3.99)
  { "Contract Number": "104100", Item: "SS-0808", "Trans Date": "2026-03-15", Price: 3.99, Quantity: 15, Amount: 59.85, "End User Code": "KUBOTA" },
  // CLM-004: contract doesn't exist
  { "Contract Number": "999999", Item: "SS-0404", "Trans Date": "2026-03-18", Price: 2.1, Quantity: 10, Amount: 21.0, "End User Code": "KUBOTA" },
]);

// LGG Claim
writeXlsx("CLAIM - LGG Industrial Mar2026.xlsx", "Claims", [
  { "Contract #": "105100", "Part Number": "4400-08-08", "Transaction Date": "2026-03-04", "Deviated Price": 4.5, Qty: 30, "Claimed Amount": 15.0, "End User": "DEERE" },
  { "Contract #": "105100", "Part Number": "4400-12-12", "Transaction Date": "2026-03-08", "Deviated Price": 6.2, Qty: 20, "Claimed Amount": 12.0, "End User": "DEERE" },
  { "Contract #": "105100", "Part Number": "4400-16-16", "Transaction Date": "2026-03-11", "Deviated Price": 8.1, Qty: 15, "Claimed Amount": 10.5, "End User": "DEERE" },
  { "Contract #": "105100", "Part Number": "4400-20-20", "Transaction Date": "2026-03-14", "Deviated Price": 10.3, Qty: 10, "Claimed Amount": 8.0, "End User": "DEERE" },
  // CLM-001: price off
  { "Contract #": "105100", "Part Number": "4400-08-08", "Transaction Date": "2026-03-17", "Deviated Price": 5.0, Qty: 25, "Claimed Amount": 12.5, "End User": "DEERE" },
  // CLM-009: duplicate claim line (same item+date as row 1)
  { "Contract #": "105100", "Part Number": "4400-08-08", "Transaction Date": "2026-03-04", "Deviated Price": 4.5, Qty: 30, "Claimed Amount": 15.0, "End User": "DEERE" },
]);

// TIPCO Claim
writeXlsx("CLAIM - TIPCO Technologies Mar2026.xlsx", "Claims", [
  { "Contract #": "106100", "Part Number": "7000-12", "Transaction Date": "2026-03-02", "Deviated Price": 12.5, Qty: 10, "Claimed Amount": 25.0, "End User": "VOLVO" },
  { "Contract #": "106100", "Part Number": "7001-12", "Transaction Date": "2026-03-06", "Deviated Price": 14.75, Qty: 8, "Claimed Amount": 22.0, "End User": "VOLVO" },
  { "Contract #": "106100", "Part Number": "7002-12", "Transaction Date": "2026-03-10", "Deviated Price": 11.2, Qty: 12, "Claimed Amount": 18.0, "End User": "VOLVO" },
  { "Contract #": "106100", "Part Number": "7000-16", "Transaction Date": "2026-03-14", "Deviated Price": 16.9, Qty: 6, "Claimed Amount": 15.0, "End User": "VOLVO" },
  // CLM-001: price mismatch
  { "Contract #": "106100", "Part Number": "7000-12", "Transaction Date": "2026-03-18", "Deviated Price": 11.0, Qty: 10, "Claimed Amount": 20.0, "End User": "VOLVO" },
  // CLM-003: item not on contract
  { "Contract #": "106100", "Part Number": "0304-C-04", "Transaction Date": "2026-03-20", "Deviated Price": 0.3, Qty: 200, "Claimed Amount": 60.0, "End User": "VOLVO" },
]);

// ============================================================================
// POS FILES — upload during reconciliation as supporting data
// ============================================================================

console.log("\n--- POS Files (March 2026) ---");

// FAS POS
writeXlsx("POS - Fastenal Mar2026.xlsx", "POS", [
  { "Vendor Part#": "0304-C-04", "Ship Date": "03/03/2026", "Qty Std": 100, "Sell Price": 0.6, "Global ID": "LB-PLANT-001", "Customer Name": "LINK-BELT LEXINGTON PLANT", "Order No": "FAS-2026-90001" },
  { "Vendor Part#": "0304-C-06", "Ship Date": "03/05/2026", "Qty Std": 80, "Sell Price": 0.74, "Global ID": "LB-PLANT-001", "Customer Name": "LINK-BELT LEXINGTON PLANT", "Order No": "FAS-2026-90002" },
  { "Vendor Part#": "0304-C-08", "Ship Date": "03/08/2026", "Qty Std": 60, "Sell Price": 1.02, "Global ID": "LB-PLANT-002", "Customer Name": "LINK-BELT SUMTER PLANT", "Order No": "FAS-2026-90003" },
  { "Vendor Part#": "0305-B-08", "Ship Date": "03/10/2026", "Qty Std": 75, "Sell Price": 0.9, "Global ID": "LB-PLANT-001", "Customer Name": "LINK-BELT LEXINGTON PLANT", "Order No": "FAS-2026-90004" },
  { "Vendor Part#": "1700-16-16", "Ship Date": "03/12/2026", "Qty Std": 10, "Sell Price": 18.6, "Global ID": "LB-PLANT-001", "Customer Name": "LINK-BELT LEXINGTON PLANT", "Order No": "FAS-2026-90005" },
  // CLM-011: qty mismatch — claim says 40, POS says 35
  { "Vendor Part#": "2403-16-16", "Ship Date": "03/15/2026", "Qty Std": 35, "Sell Price": 4.86, "Global ID": "LB-PLANT-001", "Customer Name": "LINK-BELT LEXINGTON PLANT", "Order No": "FAS-2026-90006" },
]);

// MOTION POS
writeXlsx("POS - Motion Industries Mar2026.xlsx", "POS", [
  { "MI Loc": "5613", "Vendor Part Number": "6801-08-08-NWO-FG", "Invoice Date": "03/02/2026", "Qty Shipped": 25, "Sell Price": 7.6, "Ship-to Zip": "40512", City: "LEXINGTON", State: "KY" },
  { "MI Loc": "5613", "Vendor Part Number": "6801-12-12-NWO-FG", "Invoice Date": "03/05/2026", "Qty Shipped": 18, "Sell Price": 11.04, "Ship-to Zip": "40512", City: "LEXINGTON", State: "KY" },
  { "MI Loc": "5613", "Vendor Part Number": "6400-08-08", "Invoice Date": "03/08/2026", "Qty Shipped": 30, "Sell Price": 5.8, "Ship-to Zip": "37920", City: "KNOXVILLE", State: "TN" },
  { "MI Loc": "5820", "Vendor Part Number": "6400-16-16", "Invoice Date": "03/11/2026", "Qty Shipped": 12, "Sell Price": 11.6, "Ship-to Zip": "37920", City: "KNOXVILLE", State: "TN" },
  { "MI Loc": "5613", "Vendor Part Number": "6502-12-12", "Invoice Date": "03/14/2026", "Qty Shipped": 10, "Sell Price": 14.2, "Ship-to Zip": "40512", City: "LEXINGTON", State: "KY" },
]);

// HSC POS
writeXlsx("POS - HSC Industrial Mar2026.xlsx", "POS", [
  { "Part Number": "6800-08-08", "Transaction Date": "03/05/2026", Quantity: 20, "Sell Price": 6.3, "End User": "VOLVO", "Order Number": "HSC-90001" },
  { "Part Number": "6800-12-12", "Transaction Date": "03/07/2026", Quantity: 15, "Sell Price": 9.8, "End User": "VOLVO", "Order Number": "HSC-90002" },
  { "Part Number": "6800-16-16", "Transaction Date": "03/10/2026", Quantity: 10, "Sell Price": 13.5, "End User": "VOLVO", "Order Number": "HSC-90003" },
  { "Part Number": "6800-20-20", "Transaction Date": "03/12/2026", Quantity: 8, "Sell Price": 18.8, "End User": "VOLVO", "Order Number": "HSC-90004" },
  { "Part Number": "6800-04-04", "Transaction Date": "03/15/2026", Quantity: 50, "Sell Price": 3.7, "End User": "VOLVO", "Order Number": "HSC-90005" },
]);

// AIT POS
writeXlsx("POS - AIT Supply Mar2026.xlsx", "POS", [
  { Item: "SS-0404", "Trans Date": "03/03/2026", Quantity: 25, "Sell Price": 4.2, "End User Code": "KUBOTA", "Order #": "AIT-90001" },
  { Item: "SS-0808", "Trans Date": "03/06/2026", Quantity: 20, "Sell Price": 6.9, "End User Code": "KUBOTA", "Order #": "AIT-90002" },
  { Item: "SS-1212", "Trans Date": "03/09/2026", Quantity: 12, "Sell Price": 10.4, "End User Code": "KUBOTA", "Order #": "AIT-90003" },
  { Item: "SS-1616", "Trans Date": "03/12/2026", Quantity: 8, "Sell Price": 15.6, "End User Code": "KUBOTA", "Order #": "AIT-90004" },
]);

// LGG POS
writeXlsx("POS - LGG Industrial Mar2026.xlsx", "POS", [
  { "Part Number": "4400-08-08", "Transaction Date": "03/04/2026", Quantity: 30, "Sell Price": 9.0, "End User": "DEERE", "Order Number": "LGG-90001" },
  { "Part Number": "4400-12-12", "Transaction Date": "03/08/2026", Quantity: 20, "Sell Price": 12.4, "End User": "DEERE", "Order Number": "LGG-90002" },
  { "Part Number": "4400-16-16", "Transaction Date": "03/11/2026", Quantity: 15, "Sell Price": 16.2, "End User": "DEERE", "Order Number": "LGG-90003" },
  { "Part Number": "4400-20-20", "Transaction Date": "03/14/2026", Quantity: 10, "Sell Price": 20.6, "End User": "DEERE", "Order Number": "LGG-90004" },
]);

// TIPCO POS
writeXlsx("POS - TIPCO Technologies Mar2026.xlsx", "POS", [
  { "Part Number": "7000-12", "Transaction Date": "03/02/2026", Quantity: 10, "Sell Price": 25.0, "End User": "VOLVO", "Order Number": "TIP-90001" },
  { "Part Number": "7001-12", "Transaction Date": "03/06/2026", Quantity: 8, "Sell Price": 29.5, "End User": "VOLVO", "Order Number": "TIP-90002" },
  { "Part Number": "7002-12", "Transaction Date": "03/10/2026", Quantity: 12, "Sell Price": 22.4, "End User": "VOLVO", "Order Number": "TIP-90003" },
  { "Part Number": "7000-16", "Transaction Date": "03/14/2026", Quantity: 6, "Sell Price": 33.8, "End User": "VOLVO", "Order Number": "TIP-90004" },
]);

// ============================================================================
// CONTRACT UPDATE FILES — for testing Update Contract workflow
// These simulate a distributor sending an updated price list for an existing contract
// ============================================================================

console.log("\n--- Contract Update Files ---");

// FAS update: 2 price changes, 1 new item, 1 removed item (if snapshot mode)
writeXlsx("UPDATE - Fastenal (LINK-BELT) 2026-03-19.xlsx", "Contract", [
  { "Part Number": "0304-C-04", "Rebate Price": 0.32 }, // changed from 0.30
  { "Part Number": "0304-C-06", "Rebate Price": 0.37 }, // unchanged
  { "Part Number": "0304-C-08", "Rebate Price": 0.55 }, // changed from 0.51
  { "Part Number": "0305-B-08", "Rebate Price": 0.45 }, // unchanged
  { "Part Number": "1700-16-16", "Rebate Price": 9.3 }, // unchanged
  { "Part Number": "2403-16-16", "Rebate Price": 2.43 }, // unchanged
  { "Part Number": "2404-06-06", "Rebate Price": 0.74 }, // unchanged
  // 6400-08-08 removed (was 2.90)
  { "Part Number": "6400-12-12", "Rebate Price": 3.75 }, // new item added
]);

// MOTION update: 1 price change, 2 new items
writeXlsx("UPDATE - Motion Industries (KOMATSU) 2026-03-19.xlsx", "Contract", [
  { "Part Number": "6801-08-08-NWO-FG", "Rebate Price": 3.8 }, // unchanged
  { "Part Number": "6801-12-12-NWO-FG", "Rebate Price": 5.75 }, // changed from 5.52
  { "Part Number": "6400-08-08", "Rebate Price": 2.9 }, // unchanged
  { "Part Number": "6400-16-16", "Rebate Price": 5.8 }, // unchanged
  { "Part Number": "6502-12-12", "Rebate Price": 7.1 }, // unchanged
  { "Part Number": "6502-16-16", "Rebate Price": 9.25 }, // unchanged
  { "Part Number": "6801-16-16-NWO-FG", "Rebate Price": 8.15 }, // new
  { "Part Number": "6400-20-20", "Rebate Price": 8.5 }, // new
]);

console.log("\nDone. Files written to public/test-data/");
console.log("\nTest workflow:");
console.log("  1. Create contracts via Contracts → New → Upload File");
console.log("     Use the *-contract-* files (one per distributor)");
console.log("     Contract numbers: FAS=101700, MOTION=102450, HSC=103200, AIT=104100, LGG=105100, TIPCO=106100");
console.log("  2. Approve contracts via contract detail → Approve button");
console.log("  3. Run reconciliation via Reconciliation → Upload (use *-claim-* and *-pos-* files)");
console.log("  4. Test contract updates via contract detail → Update (use *-contract-update-* files)");
