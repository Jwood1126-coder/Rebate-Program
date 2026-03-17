import { prisma } from "@/lib/db/client";
import { VALIDATION_CODES } from "@/lib/constants/validation-codes";
import { OVERLAP_EXCLUDED_STATUSES } from "@/lib/constants/statuses";
import { datesOverlap, isRetroactive, isFarFuture, safeParseDate } from "@/lib/utils/dates";
import type { ValidationResult, ValidationIssue, RecordValidationInput, RecordValidationContext } from "./types";

/**
 * Central validation service. Called by both API handlers and import pipeline.
 * Returns structured results — caller decides whether to proceed.
 */
export async function validateRecord(
  input: RecordValidationInput,
  context: RecordValidationContext
): Promise<ValidationResult> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];

  // --- Required fields ---
  if (!input.rebatePrice || input.rebatePrice <= 0) {
    errors.push({
      field: "rebatePrice",
      code: VALIDATION_CODES.PRICE_REQUIRED,
      severity: "error",
      message: "Rebate price is required and must be greater than zero.",
    });
  }

  if (!input.startDate) {
    errors.push({
      field: "startDate",
      code: VALIDATION_CODES.START_DATE_REQUIRED,
      severity: "error",
      message: "Start date is required.",
    });
  }

  if (!input.rebatePlanId) {
    errors.push({
      field: "rebatePlanId",
      code: VALIDATION_CODES.PLAN_REQUIRED,
      severity: "error",
      message: "Rebate plan is required.",
    });
  }

  if (!input.itemId && !input.itemNumber) {
    errors.push({
      field: "itemId",
      code: VALIDATION_CODES.ITEM_REQUIRED,
      severity: "error",
      message: "Item number is required.",
    });
  }

  // Parse dates for further checks
  const startDate = safeParseDate(input.startDate);
  const endDate = safeParseDate(input.endDate);

  // --- Date logic ---
  if (startDate && endDate && endDate < startDate) {
    errors.push({
      field: "endDate",
      code: VALIDATION_CODES.END_DATE_BEFORE_START,
      severity: "error",
      message: "End date must be on or after start date.",
    });
  }

  if (startDate && isRetroactive(startDate)) {
    warnings.push({
      field: "startDate",
      code: VALIDATION_CODES.RETROACTIVE_START,
      severity: "warning",
      message: "Start date is in the past. This record will have a retroactive effective date.",
    });
  }

  if (!input.endDate) {
    warnings.push({
      field: "endDate",
      code: VALIDATION_CODES.NO_END_DATE,
      severity: "warning",
      message: "No end date specified. This record will remain active indefinitely.",
    });
  }

  if (endDate && isFarFuture(endDate)) {
    warnings.push({
      field: "endDate",
      code: VALIDATION_CODES.FAR_FUTURE_END,
      severity: "warning",
      message: "End date is more than 5 years in the future. Please verify this is correct.",
    });
  }

  // --- Duplicate and overlap detection (only if we have enough data) ---
  if (input.rebatePlanId && input.itemId && startDate) {
    // IDs to exclude from duplicate/overlap checks: self (on update) + superseded record
    const excludeIds: number[] = [];
    if (context.existingRecordId) excludeIds.push(context.existingRecordId);
    if (context.supersedesRecordId) excludeIds.push(context.supersedesRecordId);
    const excludeClause = excludeIds.length > 0
      ? { id: { notIn: excludeIds } }
      : undefined;

    // Duplicate: same plan + item + start_date
    const duplicate = await prisma.rebateRecord.findFirst({
      where: {
        rebatePlanId: input.rebatePlanId,
        itemId: input.itemId,
        startDate: startDate,
        ...excludeClause,
      },
    });

    if (duplicate) {
      errors.push({
        field: "startDate",
        code: VALIDATION_CODES.DUPLICATE_RECORD,
        severity: "error",
        message: `Duplicate record: a record with the same plan, item, and start date already exists (Record #${duplicate.id}).`,
      });
    }

    // Overlap: same plan + item with overlapping date range (excluding superseded/cancelled)
    const potentialOverlaps = await prisma.rebateRecord.findMany({
      where: {
        rebatePlanId: input.rebatePlanId,
        itemId: input.itemId,
        status: { notIn: Array.from(OVERLAP_EXCLUDED_STATUSES) },
        ...excludeClause,
      },
    });

    for (const existing of potentialOverlaps) {
      if (datesOverlap(startDate, endDate ?? null, existing.startDate, existing.endDate)) {
        errors.push({
          field: "startDate",
          code: VALIDATION_CODES.OVERLAPPING_DATES,
          severity: "error",
          message: `Overlapping dates: this record overlaps with Record #${existing.id} for the same plan and item.`,
        });
        break; // One overlap error is sufficient
      }
    }
  }

  // --- Contract status check ---
  if (input.rebatePlanId) {
    const plan = await prisma.rebatePlan.findUnique({
      where: { id: input.rebatePlanId },
      include: { contract: true },
    });

    if (plan?.contract.status === "expired") {
      warnings.push({
        field: "rebatePlanId",
        code: VALIDATION_CODES.EXPIRED_CONTRACT,
        severity: "warning",
        message: "This contract has an expired status. Adding records to an expired contract may indicate a data issue.",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info,
  };
}
