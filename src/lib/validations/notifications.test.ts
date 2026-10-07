import { describe, expect, it } from "vitest";
import { notificationPreferencesSchema, notificationReadSchema } from "./notifications";

describe("notification validation", () => {
  it("accepts supported per-channel preferences", () => {
    expect(notificationPreferencesSchema.safeParse({
      preferences: [{ eventType: "COMMENT", inApp: true, email: false }],
    }).success).toBe(true);
  });

  it("rejects duplicate or unknown event preferences", () => {
    expect(notificationPreferencesSchema.safeParse({
      preferences: [
        { eventType: "COMMENT", inApp: true, email: false },
        { eventType: "COMMENT", inApp: false, email: true },
      ],
    }).success).toBe(false);
    expect(notificationPreferencesSchema.safeParse({
      preferences: [{ eventType: "UNKNOWN", inApp: true, email: false }],
    }).success).toBe(false);
  });

  it("requires bounded notification ids when marking read", () => {
    expect(notificationReadSchema.safeParse({ ids: ["clw1234567890123456789012"] }).success).toBe(true);
    expect(notificationReadSchema.safeParse({ ids: [] }).success).toBe(false);
  });
});
