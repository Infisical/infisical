// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
import { Combobox } from "./combobox";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();

      unobserve = vi.fn();

      disconnect = vi.fn();
    }
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
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
const element = (selector: string) => {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
};

it("removes chips and keeps the search input focused for an empty-query Backspace", async () => {
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Combobox
          label="Environments"
          multiple
          defaultValue={["dev", "prod"]}
          options={[
            { value: "dev", label: "Development" },
            { value: "prod", label: "Production" }
          ]}
        />
      </V4Scope>
    )
  );
  await React.act(async () => element('[aria-label="Remove Development"]').click());
  expect(document.querySelector('[aria-label="Remove Development"]')).toBeNull();
  await React.act(async () => element('button[aria-label="Environments"]').click());
  const input = element('input[role="combobox"]');
  expect(document.activeElement).toBe(input);
  await React.act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true })
    );
  });
  expect(document.querySelector('[aria-label="Remove Production"]')).toBeNull();
});

it("opens on mount with defaultOpen", async () => {
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Combobox
          label="Environment"
          defaultOpen
          options={[{ value: "dev", label: "Development" }]}
        />
      </V4Scope>
    )
  );
  expect(element('button[aria-label="Environment"]').getAttribute("aria-expanded")).toBe("true");
  expect(document.querySelector('[role="option"]')?.textContent).toContain("Development");
});

it("clears every removable chip and keeps locked ones with clearable", async () => {
  const onChange = vi.fn();
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Combobox
          label="Roles"
          multiple
          clearable
          onChange={onChange}
          defaultValue={["admin", "member", "viewer"]}
          options={[
            { value: "admin", label: "Admin", disabled: true },
            { value: "member", label: "Member" },
            { value: "viewer", label: "Viewer" }
          ]}
        />
      </V4Scope>
    )
  );
  const clear = element('[data-slot="combobox-clear"]');
  expect(clear.textContent).toBe("Clear all");
  await React.act(async () => clear.click());
  expect(onChange).toHaveBeenLastCalledWith(["admin"]);
  expect(document.querySelector('[aria-label="Remove Member"]')).toBeNull();
  expect(document.querySelector('[aria-label="Remove Admin"]')).not.toBeNull();
  expect(document.querySelector('[data-slot="combobox-clear"]')).toBeNull();
});

it.each([
  [false, undefined, true],
  [false, true, false],
  [true, undefined, true],
  [true, true, false]
] as const)(
  "outside focus with defaultOpen (multiple: %s, closeOnFocusOutside: %s) keeps it open: %s",
  async (multiple, closeOnFocusOutside, staysOpen) => {
    const options = [
      { value: "dev", label: "Development" },
      { value: "prod", label: "Production" }
    ];
    await React.act(async () =>
      root.render(
        <V4Scope>
          <input aria-label="Outside" />
          {multiple ? (
            <Combobox
              label="Environments"
              multiple
              defaultOpen
              closeOnFocusOutside={closeOnFocusOutside}
              options={options}
            />
          ) : (
            <Combobox
              label="Environment"
              defaultOpen
              closeOnFocusOutside={closeOnFocusOutside}
              options={options}
            />
          )}
        </V4Scope>
      )
    );
    expect(document.querySelectorAll('[role="option"]').length).toBe(2);
    await React.act(async () => element('[aria-label="Outside"]').focus());
    expect(document.querySelectorAll('[role="option"]').length).toBe(staysOpen ? 2 : 0);
  }
);

it("guards a dirty dialog creation and selects the option complete receives", async () => {
  const button = (name: string) => {
    const match = [...document.querySelectorAll("button")].find(
      (node) => node.textContent === name
    );
    if (!match) throw new Error(`Missing button ${name}`);
    return match;
  };
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Combobox
          label="Connection"
          defaultOpen
          options={[{ value: "prod", label: "aws-production" }]}
          creation={{
            mode: "dialog",
            label: "Create connection",
            title: "Create AWS connection",
            submitLabel: "Create connection",
            renderForm: ({ formId, complete, onDirtyChange }) => (
              <form
                id={formId}
                onSubmit={(event) => {
                  event.preventDefault();
                  complete({ value: "new", label: "aws-staging" });
                }}
              >
                <input aria-label="Name" onChange={() => onDirtyChange(true)} />
              </form>
            )
          }}
        />
      </V4Scope>
    )
  );
  await React.act(async () => element("[data-slot=combobox-create]").click());
  const input = element('[role="dialog"] input[aria-label="Name"]') as HTMLInputElement;
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "x");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await React.act(async () => button("Cancel").click());
  expect(element('[role="alertdialog"]').textContent).toContain("Discard");
  await React.act(async () => button("Keep editing").click());
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  await React.act(async () => (input.form as HTMLFormElement).requestSubmit());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(element('button[aria-label="Connection"]').textContent).toContain("aws-staging");
});
