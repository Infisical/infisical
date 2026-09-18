// Deep-search scan windows: callers over-fetch by one window unit (a row, or a distinct key for
// rank-windowed queries) so a full window can be told apart from a truncated one, then trim back
// to the window. The distinct-key variant requires rows ordered by key (the rank order), so the
// overscan key is the last first-seen key in either sort direction.

export const takeRowScanWindow = <T>(rows: T[], limit?: number): { items: T[]; isLimitReached: boolean } => {
  if (!limit) return { items: rows, isLimitReached: false };

  return { items: rows.slice(0, limit), isLimitReached: rows.length > limit };
};

export const takeDistinctKeyScanWindow = <T>(
  rows: T[],
  limit: number | undefined,
  keyOf: (row: T) => string
): { items: T[]; isLimitReached: boolean } => {
  if (!limit) return { items: rows, isLimitReached: false };

  const keys = [...new Set(rows.map(keyOf))];
  if (keys.length <= limit) return { items: rows, isLimitReached: false };

  const overscanKey = keys[keys.length - 1];
  return { items: rows.filter((row) => keyOf(row) !== overscanKey), isLimitReached: true };
};
