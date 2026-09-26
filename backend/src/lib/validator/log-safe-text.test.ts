import { describe, expect, test } from "vitest";

import { containsLogUnsafeCharacters, sanitizeLogPayload, sanitizeLogText } from "./log-safe-text";

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

  test("preserves deep structure instead of truncating it", () => {
    // oidcClaimsReceived carries whatever the IdP returned, so nesting is legitimate and the shape
    // is part of what downstream consumers parse.
    let deep: Record<string, unknown> = { value: `a${NUL}b`, keep: 7 };
    for (let i = 0; i < 40; i += 1) deep = { nested: deep };

    const sanitized = sanitizeLogPayload(deep);

    let cursor: Record<string, unknown> = sanitized;
    for (let i = 0; i < 40; i += 1) cursor = cursor.nested as Record<string, unknown>;

    expect(cursor.value).toBe("ab");
    expect(cursor.keep).toBe(7);
  });

  test("keeps both fields when two keys normalize to the same string", () => {
    const sanitized = sanitizeLogPayload({ [`a${ZWSP}b`]: 1, ab: 2 }) as Record<string, unknown>;

    expect(Object.keys(sanitized)).toHaveLength(2);
    expect(Object.values(sanitized).sort()).toEqual([1, 2]);
  });

  test("keeps a key of __proto__ as an own property", () => {
    // Computed keys: the literal form would set the prototype as the object is built.
    const sanitized = sanitizeLogPayload({ ["__proto__"]: { sub: `a${NUL}b` }, [`__pro${ZWSP}to__`]: "second" });

    const roundTripped = JSON.parse(JSON.stringify(sanitized)) as Record<string, unknown>;
    const value = (key: string) => Object.entries(roundTripped).find(([name]) => name === key)?.[1];

    expect(value("__proto__")).toEqual({ sub: "ab" });
    expect(value("__proto__~2")).toBe("second");
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

  test.each([
    ["arabic letter mark", 0x061c],
    ["mongolian vowel separator", 0x180e],
    ["word joiner", 0x2060],
    ["interlinear annotation anchor", 0xfff9],
    ["musical format control", 0x1d173],
    ["tag character", 0xe0020],
    ["soft hyphen", 0x00ad],
    ["deprecated bidi format", 0x206a],
    ["egyptian hieroglyph format control", 0x13430]
  ])("catches the %s", (_label, code) => {
    const value = `a${String.fromCodePoint(code)}b`;

    expect(containsLogUnsafeCharacters(value)).toBe(true);
    expect(sanitizeLogText(value)).toBe("ab");
  });

  test("line and paragraph separators collapse like other line breaks", () => {
    expect(sanitizeLogText(`one${String.fromCodePoint(0x2028)}two`)).toBe("one two");
    expect(sanitizeLogText(`one${String.fromCodePoint(0x2029)}two`)).toBe("one two");
  });

  test.each([0x2028, 0x2029])("a single-line field rejects U+%s", (code) => {
    const value = `one${String.fromCodePoint(code)}two`;

    expect(containsLogUnsafeCharacters(value)).toBe(true);
    expect(containsLogUnsafeCharacters(value, { allowMultiline: true })).toBe(false);
  });

  test("keeps variation selectors, which choose emoji presentation", () => {
    const flag = String.fromCodePoint(0x1f3f3, 0xfe0f);

    expect(containsLogUnsafeCharacters(flag)).toBe(false);
    expect(sanitizeLogText(flag)).toBe(flag);
  });

  test("still strips the zero-width space itself", () => {
    expect(sanitizeLogText(`ad${ZWSP}min`)).toBe("admin");
    expect(containsLogUnsafeCharacters(`ad${ZWSP}min`)).toBe(true);
  });
});
