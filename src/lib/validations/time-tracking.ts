import { z } from "zod";

const isoDate = z.string().datetime({ offset: true });
export const createTimeEntrySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }).strict(),
  z.object({ action: z.literal("stop") }).strict(),
  z.object({ action: z.literal("manual"), startedAt: isoDate, endedAt: isoDate, note: z.string().trim().max(1000).optional() }).strict(),
]).superRefine((entry, context) => {
  if (entry.action === "manual" && Date.parse(entry.endedAt) <= Date.parse(entry.startedAt)) context.addIssue({ code: "custom", path: ["endedAt"], message: "End time must be after start time" });
});

export const updateTimeEntrySchema = z.object({ startedAt: isoDate.optional(), endedAt: isoDate.optional(), note: z.string().trim().max(1000).nullable().optional() }).strict().refine((entry) => Object.keys(entry).length > 0, { message: "Provide at least one time-entry field" });

export const timeReportQuerySchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }).strict().refine(({ from, to }) => !from || !to || from <= to, { message: "Start date must be before end date" });
