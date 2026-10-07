import { z } from "zod";

const name = z.string().trim().min(1, "Name is required").max(80);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a valid color");
const boardBackgroundImage = z.string().max(2048).refine((value) => {
  if (value.startsWith("https://")) return z.string().url().safeParse(value).success;
  const match = /^\/api\/board-backgrounds\/[a-zA-Z0-9_-]+\.(?:jpg|png|webp)\?boardId=([^?]+)$/.exec(value);
  return match !== null && z.string().cuid().safeParse(match[1]).success;
});

export const createWorkspaceSchema = z.object({ name });
export const updateWorkspaceSchema = z.object({ name });
export const inviteWorkspaceSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER", "CLIENT"]).default("MEMBER"),
});
export const workspaceRoleSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER", "CLIENT"]),
});
export const boardMemberRoleSchema = z.object({
  userId: z.string().cuid(),
  role: z.enum(["ADMIN", "MEMBER", "OBSERVER", "CLIENT"]),
});
export const createBoardSchema = z.object({
  workspaceId: z.string().cuid(),
  title: name,
  backgroundColor: color.default("#2563eb"),
});
export const updateBoardSchema = z.object({
  title: name.optional(),
  backgroundColor: z.union([
    color,
    z.string().regex(/^linear-gradient\((?:to (?:right|left|top|bottom), )?(?:#[0-9a-fA-F]{6} \d{1,3}%, ){1,3}#[0-9a-fA-F]{6}(?: \d{1,3}%)?\)$/),
  ]).nullable().optional(),
  backgroundImage: boardBackgroundImage.nullable().optional(),
  visibility: z.enum(["PRIVATE", "WORKSPACE", "PUBLIC"]).optional(),
  archived: z.boolean().optional(),
});
export const createListSchema = z.object({ title: name });
export const updateListSchema = z.object({
  title: name.optional(),
  wipLimit: z.number().int().min(1).max(10000).nullable().optional(),
  archived: z.boolean().optional(),
});
export const createCardSchema = z.object({
  title: name,
  description: z.string().max(20000).nullable().optional().default(null),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional().default("NORMAL"),
  startDate: z.string().datetime({ offset: true }).nullable().optional().default(null),
  dueDate: z.string().datetime({ offset: true }).nullable().optional().default(null),
  reminderAt: z.string().datetime({ offset: true }).nullable().optional().default(null),
  isComplete: z.boolean().optional().default(false),
  coverValue: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().default(null),
});
export const updateCardSchema = z.object({
  title: name.optional(),
  archived: z.boolean().optional(),
});
