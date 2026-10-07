import { describe, expect, it } from "vitest";
import {
  agencyTemplateSchema,
  approvalActionSchema,
  cardVisibilitySchema,
  clientPortalCardActionSchema,
  clientShareSchema,
  commentVisibilitySchema,
  designPinCreateSchema,
} from "./agency";

describe("agency project validation", () => {
  it("allows client share fields to be omitted or explicitly empty", () => {
    expect(clientShareSchema.safeParse({}).success).toBe(true);
    expect(clientShareSchema.safeParse({
      clientName: null,
      clientEmail: null,
      expiresAt: null,
    }).success).toBe(true);
  });

  it("accepts only the explicit card visibility values", () => {
    expect(cardVisibilitySchema.safeParse({ visibility: "CLIENT_VISIBLE" }).success).toBe(true);
    expect(cardVisibilitySchema.safeParse({ visibility: "PUBLIC" }).success).toBe(false);
  });

  it("accepts a plain client comment independently from approval actions", () => {
    expect(clientPortalCardActionSchema.safeParse({ action: "comment", body: "Looks good" }).success).toBe(true);
    expect(clientPortalCardActionSchema.safeParse({ action: "comment", body: "Looks good", visibility: "INTERNAL" }).success).toBe(true);
    expect(clientPortalCardActionSchema.safeParse({ action: "comment", body: " " }).success).toBe(false);
    expect(clientPortalCardActionSchema.safeParse({ action: "approve" }).success).toBe(true);
  });

  it("requires a non-empty body when the client requests changes", () => {
    expect(approvalActionSchema.safeParse({ action: "approve" }).success).toBe(true);
    expect(approvalActionSchema.safeParse({ action: "request-changes", body: "Adjust the spacing" }).success).toBe(true);
    expect(approvalActionSchema.safeParse({ action: "request-changes", body: " " }).success).toBe(false);
    expect(clientPortalCardActionSchema.safeParse({ action: "request-changes", body: " " }).success).toBe(false);
  });

  it("bounds design pins to image percentages", () => {
    expect(designPinCreateSchema.safeParse({ body: "Move this", x: 0, y: 100 }).success).toBe(true);
    expect(designPinCreateSchema.safeParse({ body: "Move this", x: 101, y: 50 }).success).toBe(false);
  });

  it("accepts client-facing comments and supported agency templates", () => {
    expect(commentVisibilitySchema.safeParse({ body: "Looks good", visibility: "CLIENT" }).success).toBe(true);
    expect(agencyTemplateSchema.safeParse({ template: "website-design" }).success).toBe(true);
    expect(agencyTemplateSchema.safeParse({ template: "custom" }).success).toBe(false);
  });
});
