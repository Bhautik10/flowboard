import { WorkspaceRole } from "@prisma/client";

export function canCommentCard(
  role: WorkspaceRole,
  visibility: "INTERNAL" | "CLIENT_VISIBLE",
): boolean {
  if (role === WorkspaceRole.VIEWER) return false;
  return role !== WorkspaceRole.CLIENT || visibility === "CLIENT_VISIBLE";
}
