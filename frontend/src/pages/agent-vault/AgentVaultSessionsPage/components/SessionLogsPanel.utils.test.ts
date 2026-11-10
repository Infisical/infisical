import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AgentVaultServiceType,
  AgentVaultSessionLogDecision,
  sessionLogRecordKey
} from "@app/hooks/api/agentVault";
import { TAgentVaultSessionLogRecord } from "@app/hooks/api/agentVault/types";

import {
  countSessionLogArrivals,
  followSessionLogRowAnchor,
  hasNativeSessionLogDetails,
  matchesSessionLogSearch,
  nativeSessionLogSections,
  nativeSessionLogSummary,
  RETURN_TO_TOP_FALLBACK_MS,
  sessionLogMethodLabel,
  watchReturnToTop
} from "./SessionLogsPanel.utils";

const record = (
  overrides: Partial<TAgentVaultSessionLogRecord> = {}
): TAgentVaultSessionLogRecord => ({
  ts: "2026-11-07T10:00:00.000Z",
  seq: 1,
  proxyId: "proxy-1",
  method: "POSTGRES",
  host: "db.internal",
  port: "5432",
  path: "",
  status: 0,
  decision: AgentVaultSessionLogDecision.Brokered,
  service: "orders-db",
  accessBundle: "bundle-1",
  serviceType: AgentVaultServiceType.Postgres,
  ...overrides
});

describe("nativeSessionLogSummary", () => {
  it("uses what the agent ran, on one line", () => {
    expect(
      nativeSessionLogSummary(record({ native: { statement: "SELECT *\n  FROM orders" } }))
    ).toBe("SELECT * FROM orders");
  });

  it("falls back to the first line sent or returned rather than saying nothing was recorded", () => {
    expect(nativeSessionLogSummary(record({ native: { stdin: "\n  first input\nsecond" } }))).toBe(
      "first input"
    );
    expect(nativeSessionLogSummary(record({ native: { output: "\n\nline one\nline two" } }))).toBe(
      "line one"
    );
    expect(nativeSessionLogSummary(record({ native: { result: "SELECT 1" } }))).toBe("SELECT 1");
    expect(
      nativeSessionLogSummary(record({ native: { note: "Port forwarding isn't recorded." } }))
    ).toBe("Port forwarding isn't recorded.");
    expect(nativeSessionLogSummary(record({ native: {} }))).toBe("");
  });

  it("names an interactive shell before its output", () => {
    expect(nativeSessionLogSummary(record({ native: { shell: true, output: "$ ls" } }))).toBe(
      "Interactive shell"
    );
  });
});

describe("matchesSessionLogSearch", () => {
  const native = record({
    native: {
      command: "cat /etc/hosts",
      stdin: "piped value",
      result: "ERROR: permission denied for table users",
      output: "127.0.0.1 localhost",
      note: "Forwarded channel"
    }
  });

  it("searches the result, output, input and note of a native row", () => {
    ["permission denied", "localhost", "piped", "forwarded", "cat /etc"].forEach((term) =>
      expect(matchesSessionLogSearch(native, term)).toBe(true)
    );
    expect(matchesSessionLogSearch(native, "nothing like this")).toBe(false);
  });

  it("finds a native row by the type name the Method column shows", () => {
    expect(matchesSessionLogSearch(native, "PostgreSQL")).toBe(true);
  });

  it("matches a statement or command whole, keeping its ? and #", () => {
    const statement = record({
      native: { statement: "SELECT * FROM orders WHERE id = ? AND tenant = ?" }
    });
    expect(matchesSessionLogSearch(statement, "WHERE id = ? AND tenant")).toBe(true);
    expect(matchesSessionLogSearch(statement, "WHERE id = ? AND user")).toBe(false);
    const command = record({ native: { command: "ls -la # deploy check" } });
    expect(matchesSessionLogSearch(command, "# deploy")).toBe(true);
  });

  it("finds a multi-line statement by the one-line form its row shows", () => {
    const statement = record({ native: { statement: "SELECT *\n  FROM orders\n WHERE id = 1" } });
    expect(matchesSessionLogSearch(statement, "select * from orders where id = 1")).toBe(true);
  });

  it("still cuts a pasted URL back to its host and path for HTTP rows", () => {
    const http = record({
      method: "GET",
      host: "api.example.com",
      port: "443",
      path: "/v1/orders",
      serviceType: AgentVaultServiceType.Http
    });
    expect(matchesSessionLogSearch(http, "https://api.example.com/v1/orders?page=2")).toBe(true);
  });
});

describe("sessionLogMethodLabel", () => {
  it("names the service type once instead of the upper-case method", () => {
    expect(sessionLogMethodLabel(record())).toBe("PostgreSQL");
    expect(sessionLogMethodLabel(record({ method: "MYSQL", serviceType: null, native: {} }))).toBe(
      "MySQL"
    );
    expect(
      sessionLogMethodLabel(
        record({ method: "GET", serviceType: AgentVaultServiceType.Http, native: undefined })
      )
    ).toBe("GET");
  });
});

describe("nativeSessionLogSections", () => {
  it("lists only what was recorded, in the order it happened, and flags a failed result", () => {
    expect(
      nativeSessionLogSections({
        statement: "DELETE FROM users",
        result: "ERROR: permission denied for table users",
        output: ""
      })
    ).toEqual([
      { label: "Statement", value: "DELETE FROM users" },
      { label: "Result", value: "ERROR: permission denied for table users", isError: true }
    ]);
    expect(nativeSessionLogSections({ command: "ls", stdin: "x", output: "y" })).toEqual([
      { label: "Command", value: "ls" },
      { label: "Input", value: "x" },
      { label: "Output", value: "y" }
    ]);
    expect(nativeSessionLogSections({ result: "NO_RESPONSE" })).toEqual([
      { label: "Result", value: "NO_RESPONSE", isError: true }
    ]);
    expect(nativeSessionLogSections({ result: "SELECT 42" })).toEqual([
      { label: "Result", value: "SELECT 42", isError: false }
    ]);
  });

  it("expands a row with a note, and leaves one with nothing to show unexpandable", () => {
    expect(hasNativeSessionLogDetails(undefined)).toBe(false);
    expect(hasNativeSessionLogDetails({ note: "Forwarded channel" })).toBe(true);
    expect(hasNativeSessionLogDetails({ shell: true })).toBe(false);
    expect(hasNativeSessionLogDetails({ shell: true, output: "$ ls" })).toBe(true);
  });
});

// Lays rows out top to bottom: 41px each unless an expanded height is given.
const layout = (keys: string[], expanded: Record<string, number> = {}) => {
  let start = 0;
  return keys.map((key) => {
    const row = { key, start };
    start += expanded[key] ?? 41;
    return row;
  });
};
const keys = (count: number, prefix = "r") =>
  Array.from({ length: count }, (_, i) => `${prefix}${i}`);

describe("followSessionLogRowAnchor", () => {
  it("moves the reader down by the rows that landed above when nothing is expanded", () => {
    const before = layout(keys(30));
    const after = layout(["n0", "n1", ...keys(30)]);
    expect(followSessionLogRowAnchor(before, after, 41 * 10 + 7)).toEqual({
      scrollTop: 41 * 12 + 7,
      index: 12
    });
  });

  it("finds the row on screen when expanded rows above it push the offset past 41px a row", () => {
    const expanded = { r1: 561, r2: 561, r3: 561 };
    const before = layout(keys(30), expanded);
    // 41 * 30 = 1230, so an index guessed from the offset would point past the end of the list.
    const scrollTop = 2190;
    const after = layout(["n0", ...keys(30)], expanded);
    const moved = followSessionLogRowAnchor(before, after, scrollTop);
    expect(moved?.scrollTop).toBe(scrollTop + 41);
    expect(moved?.index).toBe(16);
  });

  it("keeps the reader at the same place inside a tall expanded row", () => {
    const before = layout(keys(10), { r4: 900 });
    const scrollTop = 41 * 4 + 650;
    const after = layout(["n0", "n1", ...keys(10)], { r4: 900 });
    expect(followSessionLogRowAnchor(before, after, scrollTop)).toEqual({
      scrollTop: scrollTop + 82,
      index: 6
    });
  });

  it("follows rows a filled gap inserts above the reader, and ignores ones inserted below", () => {
    const before = layout(keys(20));
    const scrollTop = 41 * 10;
    const above = layout([...keys(5), "g0", "g1", ...keys(15).map((_, i) => `r${i + 5}`)]);
    expect(followSessionLogRowAnchor(before, above, scrollTop)).toEqual({
      scrollTop: scrollTop + 82,
      index: 12
    });
    const below = layout([...keys(15), "g0", "g1", ...keys(5).map((_, i) => `r${i + 15}`)]);
    expect(followSessionLogRowAnchor(before, below, scrollTop)).toEqual({ scrollTop, index: 10 });
  });

  it("leaves the reader alone when an older page is appended below", () => {
    const before = layout(keys(20), { r3: 400 });
    const after = layout([...keys(20), ...keys(20, "old")], { r3: 400 });
    expect(followSessionLogRowAnchor(before, after, 1000)).toEqual({ scrollTop: 1000, index: 15 });
  });

  it("follows the row up when rows above it go away", () => {
    const before = layout(keys(20));
    const after = layout(keys(20).filter((key) => key !== "r1" && key !== "r2"));
    expect(followSessionLogRowAnchor(before, after, 41 * 10 + 3)).toEqual({
      scrollTop: 41 * 8 + 3,
      index: 8
    });
  });

  it("does nothing when the reader's row is gone or nothing was shown", () => {
    const before = layout(keys(20));
    const after = layout(keys(20).filter((key) => key !== "r10"));
    expect(followSessionLogRowAnchor(before, after, 41 * 10 + 3)).toBeNull();
    expect(followSessionLogRowAnchor([], after, 100)).toBeNull();
  });
});

describe("countSessionLogArrivals", () => {
  it("counts only rows that arrived since the last change", () => {
    const records = [record({ seq: 1 }), record({ seq: 2 }), record({ seq: 3 })];
    const arrivals = new Map<string, number>();
    const [first, second] = records;
    arrivals.set(sessionLogRecordKey(first), 200);
    arrivals.set(sessionLogRecordKey(second), 50);
    expect(countSessionLogArrivals(records, arrivals, 100)).toBe(1);
    expect(countSessionLogArrivals(records, arrivals, 300)).toBe(0);
  });
});

describe("watchReturnToTop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const scrolledDown = () => Object.assign(new EventTarget(), { scrollTop: 800 });

  it("ends once the scroll reaches the top, and only then", () => {
    const scroller = scrolledDown();
    const onEnd = vi.fn();
    watchReturnToTop(scroller, onEnd);
    scroller.scrollTop = 300;
    scroller.dispatchEvent(new Event("scroll"));
    expect(onEnd).not.toHaveBeenCalled();
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event("scroll"));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it.each(["scrollend", "wheel", "touchstart"])("ends on %s", (type) => {
    const scroller = scrolledDown();
    const onEnd = vi.fn();
    watchReturnToTop(scroller, onEnd);
    scroller.dispatchEvent(new Event(type));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("ends after the fallback when the browser never says the scroll ended", () => {
    const onEnd = vi.fn();
    watchReturnToTop(scrolledDown(), onEnd);
    vi.advanceTimersByTime(RETURN_TO_TOP_FALLBACK_MS - 1);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("stops listening once stopped, so nothing ends it a second time", () => {
    const scroller = scrolledDown();
    const onEnd = vi.fn();
    const stop = watchReturnToTop(scroller, onEnd);
    stop();
    stop();
    scroller.dispatchEvent(new Event("scrollend"));
    vi.advanceTimersByTime(RETURN_TO_TOP_FALLBACK_MS);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
