import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { StatusText } from "./text";

it("StatusText pairs a hidden icon with the words that carry the state", () => {
  const html = renderToStaticMarkup(
    <StatusText tone="bad" icon="lock">
      Universal Auth locked out
    </StatusText>
  );
  expect(html).toContain('data-tone="bad"');
  expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*data-icon-name="lock"/);
  expect(html).toContain("<span>Universal Auth locked out</span>");
});
