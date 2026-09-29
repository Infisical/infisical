import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, vi } from "vitest";

import { HIDDEN_SECRET_VALUE } from "@app/const/secrets";

import { SecretInput as SecretInputV3 } from "../../v3/platform/SecretInput/SecretInput";
import { SecretInput as SecretInputV2 } from "./SecretInput";

// The @app/hooks barrel pulls in the router and API client, which cannot load outside the app.
vi.mock("@app/hooks", async () => import("@app/hooks/useToggle"));

const MARKER_REGEX = /<span class="[^"]*bg-warning\/25[^"]*">([^<]*)<\/span>/g;

const markedChars = (markup: string) => [...markup.matchAll(MARKER_REGEX)].map(([, char]) => char);

describe.each([
  { name: "v2", SecretInput: SecretInputV2 },
  { name: "v3", SecretInput: SecretInputV3 }
])("$name SecretInput invisible characters", ({ SecretInput }) => {
  const render = (value: string, isVisible = true) =>
    renderToStaticMarkup(<SecretInput value={value} isVisible={isVisible} />);

  it("marks nothing in a value made of ordinary characters", () => {
    assert.deepEqual(markedChars(render('{ "KEY": "value with spaces\ttab" }')), []);
  });

  it("marks a non-breaking space", () => {
    assert.deepEqual(markedChars(render('"URL": "https://example.com"')), [" "]);
  });

  it("marks zero-width characters and a byte order mark", () => {
    assert.deepEqual(markedChars(render("﻿TIMEOUT=30​‍⁠")), [
      "﻿",
      "​",
      "‍",
      "⁠"
    ]);
  });

  it("marks control characters but leaves tabs and newlines alone", () => {
    assert.deepEqual(markedChars(render("a\u0000b\u001fc\u007fd\t\ne\r")), [
      "\u0000",
      "\u001f",
      "\u007f"
    ]);
  });

  it("marks soft hyphens, bidi controls, and unicode space separators", () => {
    assert.deepEqual(markedChars(render("x­y‮z⁦w v　u ")), [
      "­",
      "‮",
      "⁦",
      " ",
      "　",
      " "
    ]);
  });

  it("marks each character in a run separately and keeps the surrounding text", () => {
    const markup = render("before  after");
    assert.deepEqual(markedChars(markup), [" ", " "]);
    assert.match(markup, /before<span/);
    assert.match(markup, /<\/span>after/);
  });

  it("marks a non-breaking space that stops a reference from resolving", () => {
    const markup = render("${FOO BAR}");
    assert.deepEqual(markedChars(markup), [" "]);
    assert.doesNotMatch(markup, /text-warning\/80/);
  });

  it("still highlights a valid reference and marks invisible characters around it", () => {
    const markup = render("​${env.FOO} ");
    assert.deepEqual(markedChars(markup), ["​", " "]);
    assert.match(markup, /role="button"[^>]*>env<\/span>/);
    assert.match(markup, /role="button"[^>]*>FOO<\/span>/);
  });

  it("does not reveal or mark anything while the value is hidden", () => {
    const markup = render("secret value", false);
    assert.deepEqual(markedChars(markup), []);
    assert.match(markup, new RegExp(HIDDEN_SECRET_VALUE.replace(/[*]/g, "\\*")));
    assert.doesNotMatch(markup, /secret value/);
  });
});
