import { describe, expect, test } from "vitest";

import { containsLogUnsafeCharacters, sanitizeLogPayload, sanitizeLogText } from "./log-safe-text";

const NUL = String.fromCharCode(0);
const ESC = String.fromCharCode(27);
const RLO = String.fromCharCode(0x202e);
const ZWSP = String.fromCharCode(0x200b);

describe("sanitizeLogText", () => {
  test.each([
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

  // Both functions share the global ANSI pattern, so a check must not leave a lastIndex behind that
  // makes a later, shorter sanitize skip its sequences.
  test("does not break a later sanitize of a shorter value", () => {
    expect(containsLogUnsafeCharacters(`${"x".repeat(400)}${ESC}[31m`)).toBe(true);
    expect(sanitizeLogText(`${ESC}[31mab${ESC}[0m`)).toBe("ab");
  });
});

describe("lone surrogates", () => {
  const HIGH = String.fromCharCode(0xd800);
  const LOW = String.fromCharCode(0xdc00);

  test("are dropped instead of turning into U+FFFD, so jsonb accepts the value", () => {
    const sanitized = sanitizeLogText(`a${HIGH}b${LOW}c`);
    expect(sanitized).toBe("abc");
    expect(sanitized.isWellFormed()).toBe(true);
  });

  test("are dropped alongside the rest of the unsafe set", () => {
    expect(sanitizeLogText(`a${HIGH}${ESC}[31mb${NUL}`)).toBe("ab");
  });

  test("leave real surrogate pairs alone", () => {
    expect(sanitizeLogText(`ok \u{1F680}${HIGH}`)).toBe("ok \u{1F680}");
  });

  test("are rejected at the API, multiline or not", () => {
    expect(containsLogUnsafeCharacters(`a${HIGH}b`)).toBe(true);
    expect(containsLogUnsafeCharacters(`a${LOW}b`, { allowMultiline: true })).toBe(true);
    expect(containsLogUnsafeCharacters("ok \u{1F680}")).toBe(false);
  });

  test("are dropped from payload keys and nested values", () => {
    expect(sanitizeLogPayload({ [`k${HIGH}`]: { claim: `v${LOW}` } })).toEqual({ k: { claim: "v" } });
  });
});

describe("sanitizeLogPayload", () => {
  test("hands back the same object when nothing needs cleaning", () => {
    const payload = { name: "deploy bot", reason: "line one\nline two\tok", tags: ["a", { b: 1 }], ok: null };
    expect(sanitizeLogPayload(payload)).toBe(payload);
  });

  test("copies instead of mutating when something does", () => {
    const payload = { clean: "x", nested: { dirty: `a${NUL}b` } };
    const sanitized = sanitizeLogPayload(payload);

    expect(sanitized).not.toBe(payload);
    expect(sanitized).toEqual({ clean: "x", nested: { dirty: "ab" } });
    expect(payload.nested.dirty).toBe(`a${NUL}b`);
  });

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

  test("keeps a clean key's value under its own name when a dirty look-alike comes first", () => {
    const sanitized = sanitizeLogPayload({
      [`email${ZWSP}`]: "spoofed",
      email: "real",
      [`ab${ZWSP}`]: 1,
      ab: 2,
      "ab~2": 3
    });

    expect(sanitized).toEqual({ email: "real", "email~2": "spoofed", ab: 2, "ab~2": 3, "ab~3": 1 });
  });

  test("suffixes thousands of look-alike keys without slowing down", () => {
    const count = 20_000;
    const WORD_JOINER = String.fromCharCode(0x2060);
    // Each index written in binary with two invisible characters, so every key is distinct and short.
    const invisible = (index: number) =>
      [...index.toString(2)].map((bit) => (bit === "1" ? ZWSP : WORD_JOINER)).join("");
    const lookAlikes = Object.fromEntries(Array.from({ length: count }, (_, index) => [`a${invisible(index)}`, index]));

    const started = performance.now();
    const sanitized = sanitizeLogPayload<Record<string, unknown>>({ a: "real", "a~3": "taken", ...lookAlikes });
    const elapsedMs = performance.now() - started;

    expect(Object.keys(sanitized)).toHaveLength(count + 2);
    expect(sanitized.a).toBe("real");
    expect(sanitized["a~2"]).toBe(0);
    expect(sanitized["a~3"]).toBe("taken");
    expect(sanitized["a~4"]).toBe(1);
    expect(sanitized[`a~${count + 2}`]).toBe(count - 1);
    // Restarting the search at 2 for every key took seconds here.
    expect(elapsedMs).toBeLessThan(1000);
  });

  test("keeps a key of __proto__ as an own property", () => {
    // Computed keys: the literal form would set the prototype as the object is built.
    const sanitized = sanitizeLogPayload({ ["__proto__"]: { sub: `a${NUL}b` }, [`__pro${ZWSP}to__`]: "second" });

    const roundTripped = JSON.parse(JSON.stringify(sanitized)) as Record<string, unknown>;
    const value = (key: string) => Object.entries(roundTripped).find(([name]) => name === key)?.[1];

    expect(value("__proto__")).toEqual({ sub: "ab" });
    expect(value("__proto__~2")).toBe("second");
  });

  test("keeps line feeds and tabs, so a multiline reason reads as the user typed it", () => {
    const LF = String.fromCharCode(10);
    const TAB = String.fromCharCode(9);

    expect(sanitizeLogText(`approved by${LF}ops`)).toBe(`approved by${LF}ops`);
    expect(sanitizeLogText(`step one${LF}${LF}step${TAB}two`)).toBe(`step one${LF}${LF}step${TAB}two`);
  });

  test("normalizes CRLF and a lone CR to LF, so nothing overprints a terminal line", () => {
    const CR = String.fromCharCode(13);
    const LF = String.fromCharCode(10);

    expect(sanitizeLogText(`one${CR}${LF}two`)).toBe(`one${LF}two`);
    expect(sanitizeLogText(`real value${CR}forged value`)).toBe(`real value${LF}forged value`);
  });

  test("turns VT and FF into a space rather than running words together", () => {
    expect(sanitizeLogText(`a${String.fromCharCode(11)}b${String.fromCharCode(12)}c`)).toBe("a b c");
  });

  test("still strips escape sequences and invisible characters on a multiline value", () => {
    const LF = String.fromCharCode(10);

    expect(sanitizeLogText(`${ESC}[31mline one${LF}line${ZWSP} two${NUL}`)).toBe(`line one${LF}line two`);
  });

  test("an unterminated OSC introducer does not swallow the rest of the value", () => {
    expect(sanitizeLogText(`ok ${ESC}] ticket INF-42 rest`)).toBe("ok  ticket INF-42 rest");
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

  test("line and paragraph separators become LF, which JSON then escapes", () => {
    const LF = String.fromCharCode(10);

    expect(sanitizeLogText(`one${String.fromCodePoint(0x2028)}two`)).toBe(`one${LF}two`);
    expect(sanitizeLogText(`one${String.fromCodePoint(0x2029)}two`)).toBe(`one${LF}two`);
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
