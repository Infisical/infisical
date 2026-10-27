import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { getInvisibleCharacterSummary, splitSuspiciousCharacters } from "./invisibleCharacters";

const UNICODE_TEXT =
  "caf\u00e9 na\u00efve \u03a9\u03bc\u03ad\u03b3\u03b1 \u65e5\u672c\u8a9e \ud55c\uad6d\uc5b4 \u0645\u0631\u062d\u0628\u0627 \u{1F600} \u{1F44D}\u{1F3FD}";
const FAMILY_EMOJI = "\u{1F468}\u200d\u{1F469}\u200d\u{1F467}";
const RAINBOW_FLAG_EMOJI = "\u{1F3F3}\ufe0f\u200d\u{1F308}";
const ENGLAND_FLAG_EMOJI = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";

const marked = (value: string) =>
  splitSuspiciousCharacters(value)
    .filter(({ isSuspicious }) => isSuspicious)
    .map(({ text }) => text);

describe("splitSuspiciousCharacters", () => {
  it("keeps every character of the input across its parts", () => {
    const value = `before\u00a0\u200bafter ${FAMILY_EMOJI}\u200d${ENGLAND_FLAG_EMOJI} ${UNICODE_TEXT}`;
    assert.equal(
      splitSuspiciousCharacters(value)
        .map(({ text }) => text)
        .join(""),
      value
    );
  });

  it("marks nothing in ordinary text, tabs, or newlines", () => {
    assert.deepEqual(marked('{ "KEY": "value with spaces\ttab" }\r\n'), []);
  });

  it("marks zero-width, control, bidi, and unicode space characters one by one", () => {
    assert.deepEqual(marked("\ufeffA\u200b\u0001b\u202ez\u00a0\u00a0\u3000"), [
      "\ufeff",
      "\u200b",
      "\u0001",
      "\u202e",
      "\u00a0",
      "\u00a0",
      "\u3000"
    ]);
  });

  it("marks invisible characters outside a hardcoded list", () => {
    assert.deepEqual(marked("a\u2062b\u180ec\u061cd\u{E0001}"), [
      "\u2062",
      "\u180e",
      "\u061c",
      "\u{E0001}"
    ]);
  });

  it("marks nothing in accented, CJK, RTL, or emoji text, including joined emoji", () => {
    assert.deepEqual(
      marked(`${UNICODE_TEXT} ${FAMILY_EMOJI} ${RAINBOW_FLAG_EMOJI} ${ENGLAND_FLAG_EMOJI}`),
      []
    );
  });

  it("marks a joiner that is not part of an emoji sequence", () => {
    assert.deepEqual(marked("a\u200db"), ["\u200d"]);
    assert.deepEqual(marked("\u{1F600}\u200d"), ["\u200d"]);
  });
});

describe("getInvisibleCharacterSummary", () => {
  it("groups characters by code point in first-seen order", () => {
    assert.deepEqual(getInvisibleCharacterSummary("\u00a0a\u00a0\u200b\u0001"), [
      { codePoint: "U+00A0", label: "Unicode space", count: 2 },
      { codePoint: "U+200B", label: "Formatting character", count: 1 },
      { codePoint: "U+0001", label: "Control character", count: 1 }
    ]);
  });

  it("labels characters by their Unicode category", () => {
    assert.deepEqual(
      getInvisibleCharacterSummary("\u202e\u0085\u2028\u2029").map(({ label }) => label),
      ["Bidirectional control", "Control character", "Line separator", "Paragraph separator"]
    );
  });

  it("reports astral characters by their full code point", () => {
    assert.deepEqual(getInvisibleCharacterSummary("a\u{1D173}b\u{1D173}"), [
      { codePoint: "U+1D173", label: "Formatting character", count: 2 }
    ]);
  });
});
