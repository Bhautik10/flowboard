import { describe, expect, it } from "vitest";
import {
  boardLabelSchema,
  updateCardDetailsSchema,
  updateChecklistItemSchema,
} from "./card-details";
import { createCardSchema, updateBoardSchema } from "./workspaces";

describe("card detail validation", () => {
  it("accepts all supported priorities and nullable dates", () => {
    for (const priority of ["LOW", "NORMAL", "HIGH", "URGENT"]) {
      expect(
        updateCardDetailsSchema.safeParse({
          priority,
          dueDate: null,
        }).success,
      ).toBe(true);
    }
  });

  it("rejects legacy or unknown priorities", () => {
    expect(
      updateCardDetailsSchema.safeParse({ priority: "CRITICAL" }).success,
    ).toBe(false);
  });

  it("validates custom label colors", () => {
    expect(boardLabelSchema.safeParse({ name: "Release", color: "#12aB34" }).success).toBe(true);
    expect(boardLabelSchema.safeParse({ name: "Release", color: "red" }).success).toBe(false);
  });

  it("rejects malformed checklist ranks", () => {
    expect(updateChecklistItemSchema.safeParse({ position: "abc123" }).success).toBe(true);
    expect(updateChecklistItemSchema.safeParse({ position: "../bad" }).success).toBe(false);
  });

  it("defaults quick-added cards to normal priority and empty detail fields", () => {
    expect(createCardSchema.parse({ title: "Quick card" })).toEqual({
      title: "Quick card",
      description: null,
      priority: "NORMAL",
      startDate: null,
      dueDate: null,
      reminderAt: null,
      isComplete: false,
      coverValue: null,
    });
  });

  it("validates estimates and allows safe board background presets and image URLs", () => {
    expect(updateCardDetailsSchema.safeParse({ estimatedHours: 2.5 }).success).toBe(true);
    expect(updateCardDetailsSchema.safeParse({ estimatedHours: -1 }).success).toBe(false);
    expect(updateBoardSchema.safeParse({
      backgroundColor: "linear-gradient(to right, #2563eb 0%, #7c3aed 100%)",
    }).success).toBe(true);
    expect(updateBoardSchema.safeParse({
      backgroundImage: "https://images.example.com/board.jpg",
    }).success).toBe(true);
    expect(updateBoardSchema.safeParse({ backgroundColor: "url(javascript:alert(1))" }).success).toBe(false);
    expect(updateBoardSchema.safeParse({ backgroundImage: "data:image/svg+xml,<svg/>" }).success).toBe(false);
  });
});
