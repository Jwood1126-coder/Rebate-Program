/**
 * Shared price comparison utilities.
 *
 * All financial values are stored as DECIMAL(12,4) in the database.
 * Comparisons must account for floating-point representation differences
 * when JavaScript numbers are compared against Prisma Decimal values.
 */

/**
 * Compare two prices at DECIMAL(12,4) precision.
 * Returns true if the prices are equal after rounding to 4 decimal places.
 */
export function pricesEqual(a: number, b: number): boolean {
  return Math.round(a * 10000) === Math.round(b * 10000);
}
