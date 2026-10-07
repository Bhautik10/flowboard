import { z } from "zod";

export const notificationEvents = [
  "ASSIGNED",
  "MENTION",
  "COMMENT",
  "DUE_SOON",
  "APPROVAL_REQUESTED",
  "APPROVED",
  "CHANGES_REQUESTED",
] as const;

export const notificationEventSchema = z.enum(notificationEvents);

export const notificationPreferenceSchema = z.object({
  eventType: notificationEventSchema,
  inApp: z.boolean(),
  email: z.boolean(),
}).strict();

export const notificationPreferencesSchema = z.object({
  preferences: z.array(notificationPreferenceSchema).min(1).max(notificationEvents.length),
}).strict().superRefine(({ preferences }, context) => {
  const eventTypes = new Set<string>();
  preferences.forEach(({ eventType }, index) => {
    if (eventTypes.has(eventType)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preferences", index, "eventType"],
        message: "Notification event preferences must be unique",
      });
    }
    eventTypes.add(eventType);
  });
});

export const notificationReadSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(100),
}).strict();
