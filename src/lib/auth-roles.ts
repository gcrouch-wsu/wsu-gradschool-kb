import type { AdminSession } from "@/lib/auth";
import { canAccessKb } from "@/lib/auth";
import type { UserRole } from "@/lib/types";

export function isGlobalAdminRole(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}

export function usesKbAssignments(role: UserRole): boolean {
  return role === "manager" || role === "editor" || role === "viewer";
}

export async function canPublishInKb(session: AdminSession, kbId: string): Promise<boolean> {
  if (isGlobalAdminRole(session.role)) {
    return true;
  }
  if (session.role === "manager") {
    return canAccessKb(session, kbId);
  }
  return false;
}

export async function canApproveProposedInKb(session: AdminSession, kbId: string): Promise<boolean> {
  return canPublishInKb(session, kbId);
}
