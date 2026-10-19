// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { type ComponentExampleDefinition } from "@app/components/v4/contracts/types";

import { ExecutableExample } from "./example-loader";

let root: Root;
let host: HTMLDivElement;
const reload = vi.fn();
const silenceBoundaryError = (event: ErrorEvent) => event.preventDefault();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("location", { ...window.location, reload });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  window.addEventListener("error", silenceBoundaryError);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  window.removeEventListener("error", silenceBoundaryError);
  reload.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const settle = async () => {
  await React.act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  });
};
const state = () => host.querySelector("section")?.getAttribute("data-example-state");
const retry = async () => {
  const button = [...host.querySelectorAll("button")].find(
    (node) => node.textContent === "Try again"
  );
  if (!button) throw new Error("Missing Try again");
  await React.act(async () => button.click());
  await settle();
};
const renderExample = async (
  module: ComponentExampleDefinition["module"],
  loader: () => Promise<{ default: React.FC }>
) => {
  await React.act(async () =>
    root.render(
      <ExecutableExample
        componentId="fixture"
        example={{ id: "default", title: "Fixture", module, states: ["default"] }}
        loaders={{ [module]: loader }}
      />
    )
  );
  await settle();
};

it("reloads the page when the example's module failed to load", async () => {
  const loader = vi.fn().mockRejectedValue(new Error("Failed to fetch module"));
  await renderExample("./examples/fixture/import-failure.tsx", loader);
  expect(state()).toBe("error");
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await retry();
  expect(reload).toHaveBeenCalledTimes(1);
});

it("remounts the example without reloading when its component threw while rendering", async () => {
  let broken = true;
  const Flaky: React.FC = () => {
    if (broken) throw new Error("Render failed");
    return <p>Recovered</p>;
  };
  await renderExample("./examples/fixture/render-failure.tsx", async () => ({ default: Flaky }));
  expect(state()).toBe("error");
  broken = false;
  await retry();
  expect(reload).not.toHaveBeenCalled();
  expect(state()).toBe("mounted");
  expect(host.textContent).toContain("Recovered");
  expect(document.activeElement?.id).toBe("fixture-default-title");
});
