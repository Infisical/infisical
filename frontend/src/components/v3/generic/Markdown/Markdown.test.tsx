import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";

import { Markdown } from "./Markdown";

describe("Markdown GitHub additions", () => {
  it("renders tables", () => {
    const markup = renderToStaticMarkup(
      <Markdown>{"| Name | Size |\n| :--- | ---: |\n| a.md | 2 KB |"}</Markdown>
    );
    assert.match(markup, /<table[^>]*>/);
    assert.match(markup, /<th[^>]*>Name<\/th>/);
    assert.match(markup, /<td[^>]*text-align:right[^>]*>2 KB<\/td>/);
  });

  it("renders strikethrough", () => {
    const markup = renderToStaticMarkup(<Markdown>~~old~~ new</Markdown>);
    assert.match(markup, /<del[^>]*>old<\/del>/);
  });

  it("renders task list items as read-only checkboxes", () => {
    const markup = renderToStaticMarkup(<Markdown>{"- [x] done\n- [ ] todo"}</Markdown>);
    assert.match(markup, /role="checkbox" aria-checked="true" aria-disabled="true"/);
    assert.match(markup, /role="checkbox" aria-checked="false" aria-disabled="true"/);
    assert.ok(!markup.includes("<input"));
  });

  it("still leaves raw HTML out", () => {
    const markup = renderToStaticMarkup(<Markdown>{"<script>alert(1)</script>\n\ntext"}</Markdown>);
    assert.ok(!markup.includes("<script"));
  });
});
