/* eslint-disable no-template-curly-in-string */
import { renderToStaticMarkup } from "react-dom/server";
import assert from "node:assert/strict";
import { describe, it, vi } from "vitest";

import { HIDDEN_SECRET_VALUE } from "@app/const/secrets";

import { getInvisibleCharacterSummary } from "./invisibleCharacters";
import { SecretInput } from "./SecretInput";

// The @app/hooks barrel pulls in the router and API client, which cannot load outside the app.
vi.mock("@app/hooks", async () => import("@app/hooks/useToggle"));

const MARKER_REGEX = /<span class="[^"]*bg-warning\/25[^"]*">([^<]*)<\/span>/g;
const WARNING_ICON = 'aria-label="Value contains invisible characters"';

const markedChars = (markup: string) => [...markup.matchAll(MARKER_REGEX)].map(([, char]) => char);

const render = (value: string, isVisible = true) =>
  renderToStaticMarkup(<SecretInput value={value} isVisible={isVisible} readOnly />);

describe("SecretInput invisible characters", () => {
  it("marks nothing in a value made of ordinary characters", () => {
    assert.deepEqual(markedChars(render('{ "KEY": "value with spaces\ttab" }')), []);
  });

  it("marks a non-breaking space", () => {
    assert.deepEqual(markedChars(render('"URL":\u00a0"https://example.com"')), ["\u00a0"]);
  });

  it("marks zero-width characters and a byte order mark", () => {
    assert.deepEqual(markedChars(render("\ufeffTIMEOUT=30\u200b\u200d\u2060")), [
      "\ufeff",
      "\u200b",
      "\u200d",
      "\u2060"
    ]);
  });

  it("marks control characters but leaves tabs and newlines alone", () => {
    assert.deepEqual(markedChars(render("a\u0001b\u001fc\u007fd\t\ne\r")), [
      "\u0001",
      "\u001f",
      "\u007f"
    ]);
  });

  it("marks soft hyphens, bidi controls, and unicode space separators", () => {
    assert.deepEqual(markedChars(render("x\u00ady\u202ez\u2066w\u2003v\u3000u\u1680")), [
      "\u00ad",
      "\u202e",
      "\u2066",
      "\u2003",
      "\u3000",
      "\u1680"
    ]);
  });

  it("marks each character in a run separately and keeps the surrounding text", () => {
    const markup = render("before\u00a0\u00a0after");
    assert.deepEqual(markedChars(markup), ["\u00a0", "\u00a0"]);
    assert.match(markup, /before<span/);
    assert.match(markup, /<\/span>after/);
  });

  it("marks a non-breaking space that stops a reference from resolving", () => {
    assert.deepEqual(markedChars(render("${FOO\u00a0BAR}")), ["\u00a0"]);
    assert.deepEqual(markedChars(render("url=${env.FOO\u00a0BAR}")), ["\u00a0"]);
  });

  it("still highlights a valid reference and marks invisible characters around it", () => {
    const markup = render("\u200b${env.FOO}\u00a0");
    assert.deepEqual(markedChars(markup), ["\u200b", "\u00a0"]);
    assert.match(markup, /role="button"[^>]*>env<\/span>/);
    assert.match(markup, /role="button"[^>]*>FOO<\/span>/);
  });

  it("does not reveal or mark anything while the value is hidden", () => {
    const markup = render("secret\u00a0value", false);
    assert.deepEqual(markedChars(markup), []);
    assert.ok(markup.includes(HIDDEN_SECRET_VALUE));
    assert.ok(!markup.includes("secret\u00a0value"));
  });
});

describe("SecretInput invisible characters warning icon", () => {
  it("shows the warning icon when the value contains invisible characters", () => {
    assert.ok(render("KEY=\u00a0value").includes(WARNING_ICON));
  });

  it("shows the warning icon while the value is masked", () => {
    assert.ok(render("KEY=\u200bvalue", false).includes(WARNING_ICON));
  });

  it("does not show the warning icon for an ordinary value", () => {
    assert.ok(!render("KEY=value with spaces\ttab\n").includes(WARNING_ICON));
  });

  it("does not show the warning icon while loading or after a load error", () => {
    const props = { value: "KEY=\u00a0value", isVisible: true, readOnly: true };
    assert.ok(
      !renderToStaticMarkup(<SecretInput {...props} isLoadingValue />).includes(WARNING_ICON)
    );
    assert.ok(
      !renderToStaticMarkup(<SecretInput {...props} isErrorLoadingValue />).includes(WARNING_ICON)
    );
  });
});

describe("getInvisibleCharacterSummary", () => {
  it("returns nothing for ordinary text", () => {
    assert.deepEqual(getInvisibleCharacterSummary("plain value\twith\ttabs\n"), []);
  });

  it("groups characters by code point in first-seen order", () => {
    assert.deepEqual(getInvisibleCharacterSummary("\u00a0a\u00a0\u200b\u0001"), [
      { codePoint: "U+00A0", label: "Non-breaking space", count: 2 },
      { codePoint: "U+200B", label: "Zero-width space", count: 1 },
      { codePoint: "U+0001", label: "Control character", count: 1 }
    ]);
  });

  it("labels characters that fall back to a range", () => {
    assert.deepEqual(
      getInvisibleCharacterSummary("\u2003\u202e\u0085").map(({ label }) => label),
      ["Unicode space", "Bidirectional control", "Control character"]
    );
  });
});
