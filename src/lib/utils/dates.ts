import { parseISO, isBefore, isAfter, isEqual, addYears, subYears } from "date-fns";
import { RECORD_STATUSES, MANUAL_STATUSES } from "@/lib/constants/statuses";
import type { RecordStatus } from "@/lib/constants/statuses";

/**
 * Derives record status from dates and supersession state.
 * Priority: manual (draft/cancelled) > superseded > expired > future > active
 * See docs/SYSTEM_DESIGN.md Section 6.7 for derivation logic.
 */
export function deriveRecordStatus(
  startDate: Date,
  endDate: Date | null,
  supersededById: number | null,
  currentStatus: string,
  today: Date = new Date()
): RecordStatus {
  // Manual statuses are never overridden by derivation
  if (MANUAL_STATUSES.has(currentStatus)) {
    return currentStatus as RecordStatus;
  }

  if (supersededById !== null) {
    return RECORD_STATUSES.SUPERSEDED;
  }

  const todayDate = stripTime(today);
  const start = stripTime(startDate);
  const end = endDate ? stripTime(endDate) : null;

  if (end !== null && isBefore(end, todayDate)) {
    return RECORD_STATUSES.EXPIRED;
  }

  if (isAfter(start, todayDate)) {
    return RECORD_STATUSES.FUTURE;
  }

  return RECORD_STATUSES.ACTIVE;
}

/**
 * Checks whether two date ranges overlap.
 * Treats null end date as open-ended (infinity).
 * Ranges are inclusive on both ends: [start, end].
 */
export function datesOverlap(
  startA: Date,
  endA: Date | null,
  startB: Date,
  endB: Date | null
): boolean {
  const sA = stripTime(startA);
  const eA = endA ? stripTime(endA) : null;
  const sB = stripTime(startB);
  const eB = endB ? stripTime(endB) : null;

  // If both have end dates: overlap when startA <= endB AND startB <= endA
  // If endA is null: overlap when startB <= infinity AND startA <= endB (if endB exists) or always
  // If endB is null: symmetric
  const aEndsBeforeBStarts = eA !== null && isBefore(eA, sB);
  const bEndsBeforeAStarts = eB !== null && isBefore(eB, sA);

  return !aEndsBeforeBStarts && !bEndsBeforeAStarts;
}

/**
 * Strip time component for date-only comparisons.
 * Prevents timezone issues where "2025-01-15" shifts by a day.
 */
export function stripTime(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Parse a date string safely, returning null for invalid input.
 */
export function safeParseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  try {
    const parsed = parseISO(value);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Check if a start date is retroactive (before today).
 */
export function isRetroactive(startDate: Date, today: Date = new Date()): boolean {
  return isBefore(stripTime(startDate), stripTime(today));
}

/**
 * Check if an end date is more than N years in the future.
 */
export function isFarFuture(endDate: Date, years: number = 5, today: Date = new Date()): boolean {
  return isAfter(stripTime(endDate), addYears(stripTime(today), years));
}

/**
 * Check if a start date is more than N years in the past.
 */
export function isFarPast(startDate: Date, years: number = 2, today: Date = new Date()): boolean {
  return isBefore(stripTime(startDate), subYears(stripTime(today), years));
}
