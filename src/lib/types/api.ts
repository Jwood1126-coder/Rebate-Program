import type { ValidationCode } from "@/lib/constants/validation-codes";

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  field: string;
  code: ValidationCode;
  severity: ValidationSeverity;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface SortParams {
  sort: string;
  order: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  message: string;
  code?: string;
  details?: ValidationIssue[];
}
