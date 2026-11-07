// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { Toggle } from "./toggle";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";
import { Tooltip, TooltipProvider } from "./tooltip";

it("keeps the on state and slot of items wrapped in a Tooltip", () => {
  document.body.innerHTML = renderToStaticMarkup(
    <TooltipProvider>
      <ToggleGroup type="single" value="grid" aria-label="Layout">
        <Tooltip content="Grid">
          <ToggleGroupItem value="grid" aria-label="Grid view">
            Grid
          </ToggleGroupItem>
        </Tooltip>
        <Tooltip content="List">
          <ToggleGroupItem value="list" aria-label="List view">
            List
          </ToggleGroupItem>
        </Tooltip>
      </ToggleGroup>
      <Tooltip content="Bold">
        <Toggle pressed aria-label="Bold">
          B
        </Toggle>
      </Tooltip>
    </TooltipProvider>
  );
  const [grid, list] = Array.from(document.querySelectorAll('[role="radio"]'));
  expect(grid.getAttribute("data-slot")).toBe("toggle-group-item");
  expect(grid.getAttribute("data-state")).toBe("on");
  expect(list.getAttribute("data-state")).toBe("off");
  const bold = document.querySelector('[aria-label="Bold"]');
  expect(bold?.getAttribute("data-slot")).toBe("toggle");
  expect(bold?.getAttribute("data-state")).toBe("on");
});
