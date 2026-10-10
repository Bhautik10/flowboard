import { z } from "zod";

export const clientShareSchema = z.object({
  clientName: z.string().trim().max(120).nullable().optional(),
  clientEmail: z.string().trim().email().max(254).nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();

export const cardVisibilitySchema = z.object({
  visibility: z.enum(["INTERNAL", "CLIENT_VISIBLE"]),
}).strict();

export const commentVisibilitySchema = z.object({
  body: z.string().trim().min(1).max(10000),
  visibility: z.enum(["INTERNAL", "CLIENT"]).optional(),
}).strict();

export const approvalActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send") }).strict(),
  z.object({ action: z.literal("approve"), body: z.string().trim().max(5000).optional() }).strict(),
  z.object({ action: z.literal("request-changes"), body: z.string().trim().min(1).max(5000) }).strict(),
]);

export const clientPortalCardActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("comment"),
    body: z.string().trim().min(1).max(10000),
    visibility: z.enum(["INTERNAL", "CLIENT"]).optional(),
  }).strict(),
  z.object({ action: z.literal("approve"), body: z.string().trim().max(5000).optional() }).strict(),
  z.object({ action: z.literal("request-changes"), body: z.string().trim().min(1).max(5000) }).strict(),
]);

export const designPinCreateSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  x: z.number().finite().min(0).max(100),
  y: z.number().finite().min(0).max(100),
}).strict();

export const designPinUpdateSchema = z.object({
  resolved: z.boolean(),
}).strict();

export const attachmentVersionSelectSchema = z.object({
  versionId: z.string().cuid(),
}).strict();

export const agencyTemplateSchema = z.object({
  template: z.enum(["logo-design", "social-media-campaign", "website-design", "branding-package"]),
}).strict();
