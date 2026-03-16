import type { ValidationCode } from "@/lib/constants/validation-codes";
import type { DiscountType } from "@/lib/constants/statuses";

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  field: string;
  code: ValidationCode;
  severity: ValidationSeverity;
  message: string;
}

export interface ValidationResult {
  valid: boolean; // true only if errors is empty
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
}

export interface RecordValidationInput {
  rebatePlanId: number;
  itemId?: number;
  itemNumber?: string; // for import, before ID resolution
  rebatePrice: number;
  startDate: string; // ISO date
  endDate?: string | null;
  discountType?: DiscountType;
}

export interface RecordValidationContext {
  mode: "create" | "update";
  existingRecordId?: number; // for update, to exclude self from overlap
  userId: number;
}
