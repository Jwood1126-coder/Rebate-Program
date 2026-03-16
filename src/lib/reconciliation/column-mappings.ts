// Per-distributor column mapping configuration.
// See docs/CLAIM_FILE_SPEC.md Section 4 for mapping details.
//
// Each mapping tells the parser which column header in the distributor's file
// corresponds to which standard field in the system.
//
// To onboard a new distributor:
// 1. Get a sample claim file
// 2. Add a mapping entry here
// 3. Document in docs/CLAIM_FILE_SPEC.md Section 4

import type { ColumnMapping } from './types';

export const COLUMN_MAPPINGS: Record<string, ColumnMapping> = {
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

  // Additional distributor mappings will be added here as sample files are received.
  // Expected: HSC, AIT, LGG, TIPCO
};

/**
 * Get the column mapping for a distributor, or null if not configured.
 */
export function getColumnMapping(distributorCode: string): ColumnMapping | null {
  return COLUMN_MAPPINGS[distributorCode.toUpperCase()] ?? null;
}

/**
 * List all configured distributor codes.
 */
export function getConfiguredDistributors(): string[] {
  return Object.keys(COLUMN_MAPPINGS);
}
