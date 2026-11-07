// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { Button } from "./button";
import { TooltipProvider } from "./tooltip";

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

it("keeps a Button with disabledReason focusable but never clicks or submits it", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();

      unobserve = vi.fn();

      disconnect = vi.fn();
    }
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onClick = vi.fn();
  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
  await React.act(async () =>
    root.render(
      <TooltipProvider>
        <form onSubmit={onSubmit}>
          <Button type="submit" disabledReason="Only admins can rotate keys." onClick={onClick}>
            Rotate
          </Button>
        </form>
      </TooltipProvider>
    )
  );
  const button = host.querySelector("button")!;
  expect(button.disabled).toBe(false);
  expect(button.getAttribute("aria-disabled")).toBe("true");
  expect(button.getAttribute("aria-description")).toBe("Only admins can rotate keys.");
  button.focus();
  expect(document.activeElement).toBe(button);
  await React.act(async () => button.click());
  expect(onClick).not.toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
  await React.act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
