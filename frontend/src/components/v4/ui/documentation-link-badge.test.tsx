import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { DocumentationLinkBadge } from "./documentation-link-badge";
import { TooltipProvider } from "./tooltip";

it("opens the docs safely in a new tab and says so in its accessible name", () => {
  const markup = renderToStaticMarkup(
    <TooltipProvider>
      <DocumentationLinkBadge href="https://infisical.com/docs" />
    </TooltipProvider>
  );
  expect(markup).toContain('target="_blank"');
  expect(markup).toContain('rel="noopener noreferrer"');
  expect(markup.replace(/<[^>]+>/g, "")).toBe("Documentation (opens in a new tab)");
});
