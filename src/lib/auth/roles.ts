import { USER_ROLES, type UserRole } from "@/lib/constants/statuses";

export function canEdit(role: UserRole): boolean {
  return role === USER_ROLES.ADMIN || role === USER_ROLES.REBATE_MANAGER;
}

export function canImport(role: UserRole): boolean {
  return role === USER_ROLES.ADMIN || role === USER_ROLES.REBATE_MANAGER;
}

export function canManageUsers(role: UserRole): boolean {
  return role === USER_ROLES.ADMIN;
}

export function canManageDistributors(role: UserRole): boolean {
  return role === USER_ROLES.ADMIN;
}

export function canExport(role: UserRole): boolean {
  return true; // All roles can export
}

export function canViewAudit(role: UserRole): boolean {
  return true; // All roles can view audit history
}
