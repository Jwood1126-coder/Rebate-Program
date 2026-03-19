// Column mapping utilities — auto-suggestion and label definitions.
// Used by the detect-headers API and the mapping configuration UI.

import type { StandardFieldName, PosFieldName } from "./types";

// Human-readable labels for standard fields, grouped by importance
export const STANDARD_FIELD_LABELS: Record<StandardFieldName, { label: string; required: boolean; group: string }> = {
  contractNumber:          { label: "Contract Number",           required: true,  group: "Required" },
  itemNumber:              { label: "Item / Part Number",        required: true,  group: "Required" },
  transactionDate:         { label: "Transaction / Ship Date",   required: true,  group: "Required" },
  deviatedPrice:           { label: "Open Net Price",             required: true,  group: "Required" },
  quantity:                { label: "Quantity",                   required: true,  group: "Required" },
  claimedAmount:           { label: "Claimed Rebate Amount",     required: false, group: "Recommended" },
  standardPrice:           { label: "Standard / List Price",     required: false, group: "Recommended" },
  endUserCode:             { label: "End User Code",             required: false, group: "Recommended" },
  endUserName:             { label: "End User Name",             required: false, group: "Recommended" },
  planCode:                { label: "Plan Code",                 required: false, group: "Optional" },
  distributorItemNumber:   { label: "Distributor Item Number",   required: false, group: "Optional" },
  distributorOrderNumber:  { label: "Order / PO Number",         required: false, group: "Optional" },
  itemDescription:         { label: "Item Description",          required: false, group: "Optional" },
  vendorName:              { label: "Vendor Name",               required: false, group: "Optional" },
};

// Patterns used for auto-suggesting mappings from detected headers
const SUGGESTION_PATTERNS: Record<StandardFieldName, RegExp[]> = {
  contractNumber:         [/contract/i, /agreement/i, /brennan.*#/i],
  itemNumber:             [/vendor[\s._-]?item/i, /brennan[\s._-]?p[\/]?n/i, /part[\s._-]?num/i, /item[\s._-]?num/i, /sku/i],
  transactionDate:        [/date/i, /ship[\s._-]?date/i, /trans[\s._-]?date/i, /invoice[\s._-]?date/i],
  deviatedPrice:          [/open[\s._-]?net/i, /deviat/i, /special[\s._-]?price/i, /contract[\s._-]?price/i, /rebate[\s._-]?price/i, /net[\s._-]?price/i],
  quantity:               [/qty/i, /quantity/i, /shipped/i, /units/i],
  claimedAmount:          [/claim/i, /rebate[\s._-]?amount/i, /discount[\s._-]?owed/i, /extended/i],
  standardPrice:          [/list[\s._-]?price/i, /standard[\s._-]?price/i, /vendor[\s._-]?price/i, /current.*price/i],
  endUserCode:            [/end[\s._-]?user[\s._-]?(?:code|id)/i, /customer[\s._-]?(?:code|id)/i, /eu[\s._-]?code/i],
  endUserName:            [/end[\s._-]?user[\s._-]?name/i, /customer[\s._-]?name/i, /^name$/i],
  planCode:               [/plan[\s._-]?code/i, /plan[\s._-]?id/i, /program/i],
  distributorItemNumber:  [/motion[\s._-]?p[\/]?n/i, /dist.*item/i, /^item$/i],
  distributorOrderNumber: [/order[\s._-]?no/i, /purchase[\s._-]?order/i, /p[\s._-]?o/i, /invoice[\s._-]?no/i],
  itemDescription:        [/description/i, /desc$/i, /part[\s._-]?desc/i],
  vendorName:             [/vendor[\s._-]?name/i, /vendor$/i, /manufacturer/i, /supplier/i],
};

/**
 * Auto-suggest mappings from detected file headers.
 * Returns a partial mapping: standard field → column header.
 * Only includes fields where a confident match was found.
 */
export function suggestMappings(headers: string[]): Partial<Record<StandardFieldName, string>> {
  const suggested: Partial<Record<StandardFieldName, string>> = {};
  const usedHeaders = new Set<string>();

  // First pass: exact/strong matches
  for (const [field, patterns] of Object.entries(SUGGESTION_PATTERNS) as [StandardFieldName, RegExp[]][]) {
    for (const header of headers) {
      if (usedHeaders.has(header)) continue;
      if (patterns.some(p => p.test(header.trim()))) {
        suggested[field] = header;
        usedHeaders.add(header);
        break;
      }
    }
  }

  return suggested;
}

/**
 * Get the list of all standard field names.
 */
export function getStandardFieldNames(): StandardFieldName[] {
  return Object.keys(STANDARD_FIELD_LABELS) as StandardFieldName[];
}

// ---------------------------------------------------------------------------
// POS (Point of Sale) field labels and auto-suggestion patterns
// ---------------------------------------------------------------------------
// Based on real distributor POS formats (e.g. Fastenal POS reports).
// POS data is supplementary — used for cross-referencing, not proof.

export const POS_FIELD_LABELS: Record<PosFieldName, { label: string; required: boolean; group: string }> = {
  itemNumber:             { label: "Part / Item Number",         required: true,  group: "Required" },
  quantity:               { label: "Quantity Sold",              required: true,  group: "Required" },
  transactionDate:        { label: "Transaction / Ship Date",    required: true,  group: "Required" },
  sellPrice:              { label: "Sell / Unit Price",          required: false, group: "Recommended" },
  endUserCode:            { label: "Ship-To Customer Code",      required: false, group: "Recommended" },
  endUserName:            { label: "Ship-To Customer Name",      required: false, group: "Recommended" },
  orderNumber:            { label: "Invoice / Order Number",     required: false, group: "Recommended" },
  distributorItemNumber:  { label: "Distributor Item Number",    required: false, group: "Optional" },
  extendedAmount:         { label: "Extended Amount",            required: false, group: "Optional" },
  shipToCity:             { label: "Ship-To City",               required: false, group: "Optional" },
  shipToState:            { label: "Ship-To State",              required: false, group: "Optional" },
};

const POS_SUGGESTION_PATTERNS: Record<PosFieldName, RegExp[]> = {
  itemNumber:            [/vendor[\s._-]?part/i, /brennan[\s._-]?p[\/]?n/i, /part[\s._-]?num/i, /^part[\s._-]?number$/i, /item[\s._-]?num/i, /^item$/i, /mfg[\s._-]?part/i, /marten/i],
  quantity:              [/qty[\s._-]?std/i, /qty[\s._-]?ship/i, /qty/i, /quantity/i, /units/i],
  transactionDate:       [/ship[\s._-]?date/i, /invoice[\s._-]?date/i, /trans[\s._-]?date/i, /sale[\s._-]?date/i, /date/i],
  sellPrice:             [/sell[\s._-]?price/i, /unit[\s._-]?price/i, /price/i, /net[\s._-]?price/i],
  endUserCode:           [/ship[\s._-]?to[\s._-]?(?:code|id|cust)/i, /global[\s._-]?id/i, /customer[\s._-]?(?:code|id|num)/i, /end[\s._-]?user[\s._-]?code/i],
  endUserName:           [/ship[\s._-]?to[\s._-]?(?:name|company)/i, /customer[\s._-]?name/i, /end[\s._-]?user[\s._-]?name/i, /^end[\s._-]?user$/i, /marketing[\s._-]?code/i],
  orderNumber:           [/invoice[\s._-]?num/i, /order[\s._-]?num/i, /po[\s._-]?num/i, /invoice$/i],
  distributorItemNumber: [/store[\s._-]?item/i, /dist[\s._-]?item/i, /catalog[\s._-]?num/i, /upc/i],
  extendedAmount:        [/extend/i, /total[\s._-]?amount/i, /line[\s._-]?total/i, /net[\s._-]?amount/i, /qty[\s._-]?std[\s._-]?\$/i],
  shipToCity:            [/ship[\s._-]?to[\s._-]?city/i, /city/i],
  shipToState:           [/ship[\s._-]?to[\s._-]?state/i, /state/i],
};

/**
 * Auto-suggest POS field mappings from detected file headers.
 */
export function suggestPosMappings(headers: string[]): Partial<Record<PosFieldName, string>> {
  const suggested: Partial<Record<PosFieldName, string>> = {};
  const usedHeaders = new Set<string>();

  for (const [field, patterns] of Object.entries(POS_SUGGESTION_PATTERNS) as [PosFieldName, RegExp[]][]) {
    for (const header of headers) {
      if (usedHeaders.has(header)) continue;
      if (patterns.some(p => p.test(header.trim()))) {
        suggested[field] = header;
        usedHeaders.add(header);
        break;
      }
    }
  }

  return suggested;
}

/**
 * Get the list of all POS field names.
 */
export function getPosFieldNames(): PosFieldName[] {
  return Object.keys(POS_FIELD_LABELS) as PosFieldName[];
}
