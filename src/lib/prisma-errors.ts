/** Returns true when an additive feature's table has not yet been deployed. */
export function isMissingTableError(error: unknown, tableName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: { table?: unknown; modelName?: unknown } };
  if (candidate.code !== "P2021") return false;
  const table = candidate.meta?.table;
  const model = candidate.meta?.modelName;
  return table === tableName || table === `public.${tableName}` || model === tableName;
}

