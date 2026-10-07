import { describe, expect, it } from "vitest";
import {
  initialPosition,
  positionBetween,
  positionsNeedRebalance,
  rebalancePositions,
} from "./position";

describe("fractional positions", () => {
  it("creates an initial position and inserts before the first item", () => {
    const first = initialPosition();
    const before = positionBetween(null, first);

    expect(before < first).toBe(true);
  });

  it("inserts after the last item", () => {
    const first = initialPosition();
    const last = positionBetween(first, null);

    expect(last > first).toBe(true);
  });

  it("inserts between two neighbours", () => {
    const first = initialPosition();
    const last = positionBetween(first, null);
    const middle = positionBetween(first, last);

    expect(first < middle).toBe(true);
    expect(middle < last).toBe(true);
  });

  it("supports many repeated inserts without collisions", () => {
    const lower = initialPosition();
    let upper = positionBetween(lower, null);
    const inserted = new Set([lower, upper]);

    for (let index = 0; index < 500; index += 1) {
      upper = positionBetween(lower, upper);
      expect(inserted.has(upper)).toBe(false);
      inserted.add(upper);
    }

    expect(positionsNeedRebalance(Array.from(inserted))).toBe(true);
    expect(new Set(inserted).size).toBe(502);
  });

  it("rebalances legacy, duplicate, or overlong positions into sorted unique ranks", () => {
    const items = [
      { id: "first", position: "n" },
      { id: "second", position: "n" },
      { id: "third", position: "nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn" },
    ];
    expect(positionsNeedRebalance(items.map((item) => item.position))).toBe(true);

    const result = rebalancePositions(items);
    const ranks = result.map((item) => item.position);
    expect(result.map((item) => item.id)).toEqual(["first", "second", "third"]);
    expect(new Set(ranks).size).toBe(items.length);
    expect(ranks).toEqual([...ranks].sort());
    expect(positionsNeedRebalance(ranks)).toBe(false);
  });

  it("appends after legacy Phase 2 ranks until a rebalance is needed", () => {
    expect(positionBetween("n", null)).toBe("nn");
  });
});
