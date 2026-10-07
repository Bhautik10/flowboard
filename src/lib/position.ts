import {
  generateKeyBetween,
  generateNKeysBetween,
} from "fractional-indexing";

export const MAX_POSITION_LENGTH = 32;

export function initialPosition(): string {
  return generateKeyBetween(null, null);
}

export function positionBetween(
  before: string | null,
  after: string | null,
): string {
  if (before === null && after === null) return initialPosition();
  try {
    return generateKeyBetween(before, after);
  } catch (error) {
    if (after === null && before !== null) {
      return `${before}n`;
    }
    throw new Error(
      "Cannot generate a position between legacy or invalid ranks; rebalance the collection first.",
      { cause: error },
    );
  }
}

export function isValidPosition(position: string): boolean {
  try {
    generateKeyBetween(position, null);
    return true;
  } catch {
    return false;
  }
}

export function positionsNeedRebalance(
  positions: readonly string[],
): boolean {
  const seen = new Set<string>();
  for (const position of positions) {
    if (
      !isValidPosition(position) ||
      position.length > MAX_POSITION_LENGTH ||
      seen.has(position)
    ) {
      return true;
    }
    seen.add(position);
  }
  return false;
}

export function rebalancePositions<T extends { id: string }>(
  items: readonly T[],
): Array<{ id: string; position: string }> {
  const positions = generateNKeysBetween(null, null, items.length);
  return items.map((item, index) => ({
    id: item.id,
    position: positions[index],
  }));
}
