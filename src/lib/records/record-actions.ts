/**
 * Shared action-availability rules for rebate records.
 *
 * Both the Records table (getRowActions) and the Record Detail page
 * use this to determine which actions are valid for a given status.
 * Single source of truth — no drift between the two surfaces.
 */

import type { RecordStatus } from "@/lib/constants/statuses";

export interface RecordActions {
  canEdit: boolean;
  canSupersede: boolean;
  canExpire: boolean;
  canCancel: boolean;
  canRestore: boolean;
}

export function getAvailableActions(status: RecordStatus): RecordActions {
  switch (status) {
    case "active":
    case "future":
      return { canEdit: true, canSupersede: true, canExpire: true, canCancel: true, canRestore: false };
    case "draft":
      return { canEdit: true, canSupersede: false, canExpire: false, canCancel: true, canRestore: false };
    case "expired":
      return { canEdit: false, canSupersede: true, canExpire: false, canCancel: false, canRestore: false };
    case "cancelled":
      return { canEdit: false, canSupersede: false, canExpire: false, canCancel: false, canRestore: true };
    case "superseded":
    default:
      return { canEdit: false, canSupersede: false, canExpire: false, canCancel: false, canRestore: false };
  }
}
