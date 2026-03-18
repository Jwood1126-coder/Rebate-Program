// Status values for all entities.
// See docs/SYSTEM_DESIGN.md Appendix C for full definitions.

export const RECORD_STATUSES = {
  ACTIVE: "active",
  EXPIRED: "expired",
  FUTURE: "future",
  SUPERSEDED: "superseded",
  DRAFT: "draft",
  CANCELLED: "cancelled",
} as const;

export const CONTRACT_STATUSES = {
  PENDING_REVIEW: "pending_review",
  ACTIVE: "active",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
} as const;

export const CONTRACT_TYPES = {
  FIXED_TERM: "fixed_term",
  EVERGREEN: "evergreen",
} as const;

export type ContractType = (typeof CONTRACT_TYPES)[keyof typeof CONTRACT_TYPES];

export const PLAN_STATUSES = {
  ACTIVE: "active",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
} as const;

export const IMPORT_BATCH_STATUSES = {
  PENDING: "pending",
  MAPPED: "mapped",
  VALIDATED: "validated",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export const DISCOUNT_TYPES = {
  PART: "part",
  PRODUCT_CODE: "product_code",
} as const;

export const USER_ROLES = {
  ADMIN: "admin",
  REBATE_MANAGER: "rebate_manager",
  VIEWER: "viewer",
} as const;

export const AUDIT_ACTIONS = {
  INSERT: "INSERT",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
} as const;

export const NOTE_TYPES = {
  GENERAL: "general",
  PRICE_CHANGE_REASON: "price_change_reason",
  APPROVAL: "approval",
  INTERNAL: "internal",
} as const;

// Manual statuses that are never overridden by date derivation
export const MANUAL_STATUSES: Set<string> = new Set([
  RECORD_STATUSES.DRAFT,
  RECORD_STATUSES.CANCELLED,
]);

// Statuses excluded from overlap detection
export const OVERLAP_EXCLUDED_STATUSES: Set<string> = new Set([
  RECORD_STATUSES.SUPERSEDED,
  RECORD_STATUSES.CANCELLED,
]);

export type RecordStatus = (typeof RECORD_STATUSES)[keyof typeof RECORD_STATUSES];
export type ContractStatus = (typeof CONTRACT_STATUSES)[keyof typeof CONTRACT_STATUSES];
export type PlanStatus = (typeof PLAN_STATUSES)[keyof typeof PLAN_STATUSES];
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[keyof typeof IMPORT_BATCH_STATUSES];
export type DiscountType = (typeof DISCOUNT_TYPES)[keyof typeof DISCOUNT_TYPES];
export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
export type NoteType = (typeof NOTE_TYPES)[keyof typeof NOTE_TYPES];

// Contract update run statuses
export const CONTRACT_UPDATE_STATUSES = {
  STAGED: "staged",
  REVIEW: "review",
  COMMITTED: "committed",
  CANCELLED: "cancelled",
} as const;

// Contract update diff types
export const DIFF_TYPES = {
  CHANGED: "changed",
  ADDED: "added",
  REMOVED: "removed",
} as const;

// Contract update file modes
export const FILE_MODES = {
  SNAPSHOT: "snapshot",
  DELTA: "delta",
} as const;

// Contract update diff match statuses
export const MATCH_STATUSES = {
  AUTO: "auto",
  AMBIGUOUS: "ambiguous",
  MANUAL: "manual",
} as const;

export type ContractUpdateStatus = (typeof CONTRACT_UPDATE_STATUSES)[keyof typeof CONTRACT_UPDATE_STATUSES];
export type DiffType = (typeof DIFF_TYPES)[keyof typeof DIFF_TYPES];
export type FileMode = (typeof FILE_MODES)[keyof typeof FILE_MODES];
export type MatchStatus = (typeof MATCH_STATUSES)[keyof typeof MATCH_STATUSES];
