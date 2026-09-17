import { describe, expect, test } from "vitest";

import { containsLogUnsafeCharacters, DEPTH_LIMIT_MARKER, sanitizeLogPayload, sanitizeLogText } from "./log-safe-text";

const NUL = String.fromCharCode(0);
const ESC = String.fromCharCode(27);
const RLO = String.fromCharCode(0x202e);
const ZWSP = String.fromCharCode(0x200b);

describe("sanitizeLogText", () => {
  test.each([
    ["line feed", `deploy${String.fromCharCode(10)}worker`, "deploy worker"],
    ["carriage return", `a${String.fromCharCode(13)}b`, "a b"],
    ["null byte", `svc${NUL}account`, "svcaccount"],
    ["ansi colour", `${ESC}[31mroot${ESC}[0m`, "root"],
    ["ansi osc", `${ESC}]0;title${String.fromCharCode(7)}x`, "x"],
    ["bidi override", `report${RLO}txt.exe`, "reporttxt.exe"],
    ["zero width", `ad${ZWSP}min`, "admin"],
    ["c1 control", `a${String.fromCharCode(155)}b`, "ab"]
  ])("strips %s", (_label, input, expected) => {
    expect(sanitizeLogText(input)).toBe(expected);
  });

  test("leaves ordinary text untouched", () => {
    const value = "build-agent v1.2 (linux), ok";
    expect(sanitizeLogText(value)).toBe(value);
  });

  test("passes through null and undefined", () => {
    expect(sanitizeLogText(null)).toBeNull();
    expect(sanitizeLogText(undefined)).toBeUndefined();
  });
});

describe("containsLogUnsafeCharacters", () => {
  test.each([`a${NUL}b`, `${ESC}[31m`, `x${RLO}y`, `x${ZWSP}y`, `a${String.fromCharCode(10)}b`])(
    "flags %j",
    (value) => {
      expect(containsLogUnsafeCharacters(value)).toBe(true);
    }
  );

  test("does not flag ordinary text", () => {
    expect(containsLogUnsafeCharacters("prod-db read, ticket INF-42")).toBe(false);
  });

  test("allows newline, tab and CR only when the caller opts in", () => {
    const multiline = `line one${String.fromCharCode(10)}line two${String.fromCharCode(9)}tabbed`;
    const crlf = `one${String.fromCharCode(13)}${String.fromCharCode(10)}two`;

    expect(containsLogUnsafeCharacters(multiline)).toBe(true);
    expect(containsLogUnsafeCharacters(multiline, { allowMultiline: true })).toBe(false);
    expect(containsLogUnsafeCharacters(crlf, { allowMultiline: true })).toBe(false);
  });

  test("still flags the rest of the set when multiline is allowed", () => {
    expect(containsLogUnsafeCharacters(`a${NUL}b`, { allowMultiline: true })).toBe(true);
    expect(containsLogUnsafeCharacters(`${ESC}[31m`, { allowMultiline: true })).toBe(true);
    expect(containsLogUnsafeCharacters(`x${RLO}y`, { allowMultiline: true })).toBe(true);
    expect(containsLogUnsafeCharacters(`x${ZWSP}y`, { allowMultiline: true })).toBe(true);
  });

  // A stale lastIndex on the global pattern would make repeat calls alternate.
  test("is stable across repeated calls", () => {
    const value = `a${NUL}b`;
    expect(containsLogUnsafeCharacters(value)).toBe(true);
    expect(containsLogUnsafeCharacters(value)).toBe(true);
  });
});

describe("sanitizeLogPayload", () => {
  test("sanitizes nested values, keys and arrays", () => {
    expect(
      sanitizeLogPayload({
        [`na${ZWSP}me`]: `svc${NUL}acct`,
        nested: { reason: `${ESC}[31mapproved`, count: 3, flag: true, missing: null },
        tags: [`a${RLO}b`, "clean"]
      })
    ).toEqual({
      name: "svcacct",
      nested: { reason: "approved", count: 3, flag: true, missing: null },
      tags: ["ab", "clean"]
    });
  });

  test("returns non-object payloads unchanged", () => {
    expect(sanitizeLogPayload(42)).toBe(42);
    expect(sanitizeLogPayload(null)).toBeNull();
  });

  test("marks the subtree at the depth cap rather than dropping it silently", () => {
    let deep: Record<string, unknown> = { value: `a${NUL}b` };
    for (let i = 0; i < 40; i += 1) deep = { nested: deep };

    const sanitized = sanitizeLogPayload(deep);

    let cursor: unknown = sanitized;
    for (let i = 0; i < 12; i += 1) cursor = (cursor as Record<string, unknown>).nested;
    expect(cursor).toBe(DEPTH_LIMIT_MARKER);
  });

  test("keeps both fields when two keys normalize to the same string", () => {
    const sanitized = sanitizeLogPayload({ [`a${ZWSP}b`]: 1, ab: 2 }) as Record<string, unknown>;

    expect(Object.keys(sanitized)).toHaveLength(2);
    expect(Object.values(sanitized).sort()).toEqual([1, 2]);
  });

  test("whitespace controls collapse to a single space, preserving word boundaries", () => {
    expect(sanitizeLogText(`approved by${String.fromCharCode(10)}ops`)).toBe("approved by ops");
    expect(sanitizeLogText(`one${String.fromCharCode(13)}${String.fromCharCode(10)}two`)).toBe("one two");
    expect(sanitizeLogText(`a${String.fromCharCode(9)}b`)).toBe("a b");
  });

  test("an unterminated OSC introducer does not swallow the rest of the value", () => {
    expect(sanitizeLogText(`ok ${ESC}] ticket INF-42 rest`)).toBe("ok  ticket INF-42 rest");
    // A properly terminated sequence still goes entirely.
    expect(sanitizeLogText(`${ESC}]0;title${String.fromCharCode(7)}kept`)).toBe("kept");
  });

  test("leaves ZWNJ and ZWJ alone, so emoji and Indic/Arabic script survive", () => {
    const rainbowFlag = "\u{1F3F3}\uFE0F\u200D\u{1F308}";
    const persian = "\u0645\u06CC\u200C\u0634\u0648\u062F";

    expect(sanitizeLogText(rainbowFlag)).toBe(rainbowFlag);
    expect(sanitizeLogText(persian)).toBe(persian);
    expect(containsLogUnsafeCharacters(rainbowFlag)).toBe(false);
    expect(containsLogUnsafeCharacters(persian)).toBe(false);
  });

  test("still strips the zero-width space itself", () => {
    expect(sanitizeLogText(`ad${ZWSP}min`)).toBe("admin");
    expect(containsLogUnsafeCharacters(`ad${ZWSP}min`)).toBe(true);
  });
});
