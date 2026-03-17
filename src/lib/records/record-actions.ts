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
}

export function getAvailableActions(status: RecordStatus): RecordActions {
  switch (status) {
    case "active":
    case "future":
      return { canEdit: true, canSupersede: true, canExpire: true, canCancel: true };
    case "draft":
      return { canEdit: true, canSupersede: false, canExpire: false, canCancel: true };
    case "expired":
      return { canEdit: false, canSupersede: true, canExpire: false, canCancel: false };
    case "superseded":
    case "cancelled":
    default:
      return { canEdit: false, canSupersede: false, canExpire: false, canCancel: false };
  }
}
