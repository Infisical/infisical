import { takeDistinctKeyScanWindow, takeRowScanWindow } from "./scan-window";

describe("takeRowScanWindow", () => {
  test("returns everything when no limit is set", () => {
    const rows = [1, 2, 3];
    expect(takeRowScanWindow(rows)).toEqual({ items: rows, isLimitReached: false });
  });

  test("is not reached when rows fit inside the window", () => {
    const rows = [1, 2, 3];
    expect(takeRowScanWindow(rows, 5)).toEqual({ items: rows, isLimitReached: false });
  });

  test("is not reached at exactly the window size", () => {
    const rows = [1, 2, 3, 4, 5];
    expect(takeRowScanWindow(rows, 5)).toEqual({ items: rows, isLimitReached: false });
  });

  test("trims the overscan row and reports the limit", () => {
    const rows = [1, 2, 3, 4, 5, 6];
    expect(takeRowScanWindow(rows, 5)).toEqual({ items: [1, 2, 3, 4, 5], isLimitReached: true });
  });
});

describe("takeDistinctKeyScanWindow", () => {
  const row = (key: string, id: number) => ({ key, id });
  const keyOf = (r: { key: string }) => r.key;

  test("returns everything when no limit is set", () => {
    const rows = [row("a", 1), row("b", 2)];
    expect(takeDistinctKeyScanWindow(rows, undefined, keyOf)).toEqual({ items: rows, isLimitReached: false });
  });

  test("counts distinct keys, not rows, so multi-environment duplicates never trip the limit", () => {
    const rows = [row("a", 1), row("a", 2), row("b", 3), row("b", 4), row("c", 5), row("c", 6)];
    expect(takeDistinctKeyScanWindow(rows, 5, keyOf)).toEqual({ items: rows, isLimitReached: false });
  });

  test("is not reached at exactly the window size", () => {
    const rows = [row("a", 1), row("b", 2), row("c", 3)];
    expect(takeDistinctKeyScanWindow(rows, 3, keyOf)).toEqual({ items: rows, isLimitReached: false });
  });

  test("trims every row of the overscan key and reports the limit", () => {
    const rows = [row("a", 1), row("b", 2), row("b", 3), row("c", 4), row("c", 5)];
    expect(takeDistinctKeyScanWindow(rows, 2, keyOf)).toEqual({
      items: [row("a", 1), row("b", 2), row("b", 3)],
      isLimitReached: true
    });
  });

  test("trims the overscan key when rows are ordered descending", () => {
    const rows = [row("c", 1), row("b", 2), row("a", 3), row("a", 4)];
    expect(takeDistinctKeyScanWindow(rows, 2, keyOf)).toEqual({
      items: [row("c", 1), row("b", 2)],
      isLimitReached: true
    });
  });
});
