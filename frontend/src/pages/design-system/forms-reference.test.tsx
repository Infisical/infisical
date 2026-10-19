// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { componentCatalog } from "@app/components/v4/catalog";

import { ComponentPreviewPage } from "./ComponentPreviewPage";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", function ResizeObserverMock() {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const page = async (id: string) => {
  await React.act(async () =>
    root.render(
      <React.Suspense fallback={null}>
        <ComponentPreviewPage key={id} page={id} />
      </React.Suspense>
    )
  );
  await vi.waitFor(
    async () => {
      await React.act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
      });
      expect(host.querySelectorAll('[data-example-state="mounted"]')).toHaveLength(
        componentCatalog.find((entry) => entry.id === id)?.examples.length ?? 0
      );
    },
    { timeout: 5000 }
  );
};
const edit = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value"
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
it("shows all Input densities together and preserves the exact controlled draft", async () => {
  await page("input");
  expect(host.querySelector('[aria-label="Input sizes"]')?.querySelectorAll("input")).toHaveLength(
    3
  );
  const draft = host.querySelector('input[aria-label="Draft path"]');
  if (!(draft instanceof HTMLInputElement)) throw new Error("Missing Draft path");
  await edit(draft, "  /services/payments  ");
  expect(host.querySelector("[data-draft-value]")?.textContent).toBe("  /services/payments  ");
  expect(host.querySelector("input[readonly]")).not.toBeNull();
  expect(host.querySelector('input[size="12"]')).not.toBeNull();
});

it("changes each controlled Switch independently", async () => {
  await page("switch");
  const controls = [
    ...host.querySelectorAll<HTMLButtonElement>('[data-example="default"] [role="switch"]')
  ];
  expect(controls).toHaveLength(2);
  expect(controls[0].getAttribute("aria-checked")).toBe("true");
  expect(controls[1].getAttribute("aria-checked")).toBe("false");
  await React.act(async () => controls[0].click());
  expect(controls[0].getAttribute("aria-checked")).toBe("false");
  expect(controls[1].getAttribute("aria-checked")).toBe("false");
  await React.act(async () => controls[1].click());
  expect(controls[1].getAttribute("aria-checked")).toBe("true");
});

it("changes controlled ToggleGroup permissions while retaining the disabled selection", async () => {
  await page("toggle-group");
  const group = host.querySelector('[aria-label="Permission flags"]');
  const write = group?.querySelector('[aria-label="Write permission"]');
  const admin = group?.querySelector('[aria-label="Administrator permission"]');
  if (!(write instanceof HTMLButtonElement) || !(admin instanceof HTMLButtonElement))
    throw new Error("Missing permission flags");
  await React.act(async () => write.click());
  expect(write.getAttribute("aria-pressed")).toBe("true");
  expect(admin.disabled).toBe(true);
  expect(admin.getAttribute("aria-pressed")).toBe("true");
  await React.act(async () => write.click());
  expect(write.getAttribute("aria-pressed")).toBe("false");
  expect(admin.getAttribute("aria-pressed")).toBe("true");
});
