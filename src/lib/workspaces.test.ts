import { WorkspaceRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canCommentCard } from "./permissions";

describe("card comment permissions", () => {
  it("allows clients to comment only on client-visible cards", () => {
    expect(canCommentCard(WorkspaceRole.CLIENT, "CLIENT_VISIBLE")).toBe(true);
    expect(canCommentCard(WorkspaceRole.CLIENT, "INTERNAL")).toBe(false);
  });

  it("allows team roles and rejects viewers", () => {
    expect(canCommentCard(WorkspaceRole.OWNER, "INTERNAL")).toBe(true);
    expect(canCommentCard(WorkspaceRole.ADMIN, "INTERNAL")).toBe(true);
    expect(canCommentCard(WorkspaceRole.MEMBER, "INTERNAL")).toBe(true);
    expect(canCommentCard(WorkspaceRole.VIEWER, "CLIENT_VISIBLE")).toBe(false);
  });
});
