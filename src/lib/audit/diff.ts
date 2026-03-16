/**
 * Compute field-level diffs between old and new record state.
 * Returns JSONB-compatible structure per docs/SYSTEM_DESIGN.md Appendix C:
 * { "field_name": { "old": value, "new": value } }
 *
 * Excludes metadata fields (updatedAt, etc.) from diff.
 */

const EXCLUDED_FIELDS = new Set(["updatedAt", "updated_at", "updatedById", "updated_by_id"]);

export function computeFieldDiff(
  oldRecord: Record<string, unknown>,
  newRecord: Record<string, unknown>
): Record<string, { old: unknown; new: unknown }> {
  const diff: Record<string, { old: unknown; new: unknown }> = {};

  const allKeys = new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)]);

  for (const key of allKeys) {
    if (EXCLUDED_FIELDS.has(key)) continue;

    const oldVal = oldRecord[key] ?? null;
    const newVal = newRecord[key] ?? null;

    // Convert Decimals and Dates to strings for comparison
    const oldStr = normalizeValue(oldVal);
    const newStr = normalizeValue(newVal);

    if (oldStr !== newStr) {
      diff[key] = { old: oldStr, new: newStr };
    }
  }

  return diff;
}

/**
 * Build a full snapshot for INSERT audit entries.
 * Every field gets old: null, new: value.
 */
export function computeInsertSnapshot(
  record: Record<string, unknown>
): Record<string, { old: null; new: unknown }> {
  const snapshot: Record<string, { old: null; new: unknown }> = {};

  for (const [key, value] of Object.entries(record)) {
    if (EXCLUDED_FIELDS.has(key)) continue;
    snapshot[key] = { old: null, new: normalizeValue(value) };
  }

  return snapshot;
}

function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toFixed" in (value as object)) {
    // Prisma Decimal — preserve precision as string
    return String(value);
  }
  return value;
}
