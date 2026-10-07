import { z } from "zod";

const title = z.string().trim().min(1).max(200);
const date = z.string().datetime({ offset: true }).nullable();

export const updateCardDetailsSchema = z.object({
  title: title.optional(),
  archived: z.boolean().optional(),
  description: z.string().max(20000).nullable().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  startDate: date.optional(),
  dueDate: date.optional(),
  reminderAt: date.optional(),
  isComplete: z.boolean().optional(),
  coverValue: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  estimatedHours: z.number().finite().min(0).max(100000).nullable().optional(),
  visibility: z.enum(["INTERNAL", "CLIENT_VISIBLE"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "At least one card field is required",
});

export const cardMembersSchema = z.object({
  userIds: z.array(z.string().cuid()).max(100),
}).strict();

export const cardLabelsSchema = z.object({
  labelIds: z.array(z.string().cuid()).max(100),
}).strict();

export const boardLabelSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
}).strict();

export const createChecklistSchema = z.object({
  title: z.string().trim().min(1).max(120),
}).strict();

export const updateChecklistSchema = createChecklistSchema;

export const createChecklistItemSchema = z.object({
  text: z.string().trim().min(1).max(500),
}).strict();

export const createSubtaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
}).strict();

export const updateChecklistItemSchema = z.object({
  text: z.string().trim().min(1).max(500).optional(),
  isComplete: z.boolean().optional(),
  position: z.string().regex(/^[0-9A-Za-z]{1,128}$/).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "At least one checklist item field is required",
});
