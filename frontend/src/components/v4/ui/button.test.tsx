// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { Button } from "./button";

it("defaults to type button, keeps an explicit type and adds none to an asChild anchor", () => {
  document.body.innerHTML = renderToStaticMarkup(
    <form>
      <Button>Generate</Button>
      <Button type="submit">Save</Button>
      <Button asChild>
        <a href="/docs">Docs</a>
      </Button>
    </form>
  );
  const [generate, save] = Array.from(document.querySelectorAll("button"));
  expect(generate.getAttribute("type")).toBe("button");
  expect(save.getAttribute("type")).toBe("submit");
  expect(document.querySelector("a")?.hasAttribute("type")).toBe(false);
});
