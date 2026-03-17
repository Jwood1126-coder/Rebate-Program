// Per-distributor column mapping configuration — synchronous, hardcoded defaults.
// See docs/CLAIM_FILE_SPEC.md Section 4 for mapping details.
//
// This file contains ONLY the hardcoded fallback mappings and synchronous getters.
// For DB-backed async lookups, use column-mappings.server.ts instead.
//
// To onboard a new distributor via UI:
// 1. Go to Settings → Column Mappings
// 2. Select the distributor, upload a sample file
// 3. Map detected columns to standard fields
// 4. Save

import type { ColumnMapping } from './types';

// ---------------------------------------------------------------------------
// Hardcoded defaults (fallback for distributors not yet in the DB)
// ---------------------------------------------------------------------------

export const HARDCODED_MAPPINGS: Record<string, ColumnMapping> = {
  FAS: {
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
    skipColumns: [],
  },

  MOTION: {
    distributorCode: 'MOTION',
    name: 'Motion Industries Claim File',
    mappings: {
      contractNumber: 'Brennan Contract #',
      itemNumber: 'Brennan PN',
      transactionDate: 'Ship Date',
      deviatedPrice: 'Special Price',
      quantity: 'Qty Shipped',
      claimedAmount: 'Rebate Amount',
      standardPrice: 'List Price',
      endUserCode: 'End User ID',
      endUserName: 'End User Name',
      distributorItemNumber: 'Motion PN',
      distributorOrderNumber: 'Purchase Order #',
      itemDescription: 'Part Description',
    },
    dateFormat: 'M/d/yyyy',
  },
};

/**
 * Synchronous getter — uses hardcoded mappings only.
 */
export function getColumnMapping(distributorCode: string): ColumnMapping | null {
  return HARDCODED_MAPPINGS[distributorCode.toUpperCase()] ?? null;
}

/**
 * Synchronous list of configured distributor codes — hardcoded only.
 */
export function getConfiguredDistributors(): string[] {
  return Object.keys(HARDCODED_MAPPINGS);
}
