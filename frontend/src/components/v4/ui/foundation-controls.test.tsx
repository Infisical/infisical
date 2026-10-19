// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
import { Button } from "./button";
import { ButtonGroup } from "./button-group";
import { Checkbox } from "./checkbox";
import { Collapsible, CollapsibleTrigger } from "./collapsible";
import { Combobox } from "./combobox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { Field } from "./field";
import { Input } from "./input";
import { InputGroup, InputGroupInput } from "./input-group";
import { Label } from "./label";
import { MultiSelect } from "./multi-select";
import { Select } from "./select";
import { Slider } from "./slider";

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
const render = async (children: React.ReactNode) => {
  await React.act(async () => root.render(<V4Scope>{children}</V4Scope>));
};
const element = (selector: string) => {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
};
const click = async (selector: string) => {
  await React.act(async () => element(selector).click());
};
const key = async (node: HTMLElement, name: string) => {
  await React.act(async () => {
    node.dispatchEvent(
      new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })
    );
  });
};

describe("foundation controls", () => {
  it("forwards React18 refs through Radix leaf wrappers", async () => {
    const label = React.createRef<HTMLLabelElement>();
    const trigger = React.createRef<HTMLButtonElement>();
    await render(
      <>
        <Label ref={label}>Environment</Label>
        <Collapsible>
          <CollapsibleTrigger ref={trigger}>Advanced</CollapsibleTrigger>
        </Collapsible>
      </>
    );
    expect(label.current?.tagName).toBe("LABEL");
    expect(trigger.current?.tagName).toBe("BUTTON");
  });
  it("wires Field IDs and errors into direct, grouped and options controls", async () => {
    await render(
      <>
        <Field label="Key" description="Help text" error="Use uppercase">
          <Input />
        </Field>
        <Field label="Name" description="Project name">
          <InputGroup>
            <InputGroupInput />
          </InputGroup>
        </Field>
        <Field label="Environment" error="Choose an environment">
          <Select options={[{ value: "prod", label: "Production" }]} />
        </Field>
        <Field label="Roles" group>
          <Checkbox label="Read" />
          <Checkbox label="Write" />
        </Field>
      </>
    );
    const labels = [...document.querySelectorAll<HTMLLabelElement>('[data-slot="field-label"]')];
    labels.forEach((label) => {
      expect(document.getElementById(label.htmlFor)).not.toBeNull();
    });
    const input = element('[data-slot="input"]');
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(
      document.getElementById(input.getAttribute("aria-describedby") ?? "")?.textContent
    ).toContain("Use uppercase");
    expect(document.body.textContent).not.toContain("Help text");
    expect(document.querySelector("fieldset > legend")?.textContent).toBe("Roles");
    expect(element('[data-slot="select-trigger"]').getAttribute("aria-invalid")).toBe("true");
  });
  it("keeps selected option metadata separate and readable across controlled value changes", async () => {
    const options = [
      { value: "dev", label: "Development", description: "3 projects" },
      { value: "prod", label: "Production", description: "12 projects" }
    ];
    await render(<Select label="Environment" options={options} value="prod" />);
    const trigger = element('[data-slot="select-trigger"]');
    expect(trigger.textContent).toContain("Production");
    expect(trigger.textContent).not.toContain("12 projects");
    expect(trigger.querySelector('[data-slot="select-option-label"]')?.textContent).toBe(
      "Production"
    );
    await render(<Select label="Environment" options={options} value="dev" />);
    expect(trigger.textContent).toContain("Development");
    expect(trigger.textContent).not.toContain("3 projects");
    expect(trigger.textContent).not.toContain("12 projects");
  });
  it("keeps multiple selections truthful and preserves disabled values during bulk changes", async () => {
    await render(
      <MultiSelect
        label="Roles"
        defaultOpen
        defaultValue={["locked"]}
        options={[
          { value: "read", label: "Read" },
          { value: "locked", label: "Locked", disabled: true },
          { value: "write", label: "Write" }
        ]}
      />
    );
    expect(element('[role="listbox"]').getAttribute("aria-multiselectable")).toBe("true");
    await click('[role="option"][aria-disabled="true"]');
    expect(element('[role="option"][aria-disabled="true"]').getAttribute("aria-selected")).toBe(
      "true"
    );
    expect(
      [...document.querySelectorAll("button")].some((button) => button.textContent === "Select all")
    ).toBe(false);
    await React.act(async () => {
      element('[role="listbox"]').dispatchEvent(
        new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true })
      );
    });
    expect(document.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(3);
    expect(document.querySelector('[data-slot="multi-select-footer"]')).toBeNull();
    await React.act(async () => {
      element('[role="listbox"]').dispatchEvent(
        new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true })
      );
    });
    expect(document.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(1);
    const list = element('[role="listbox"]');
    await key(list, "End");
    await key(list, " ");
    expect(document.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(2);
    expect(document.querySelector('[data-slot="popover-content"]')).not.toBeNull();
  });
  it("supports removable combobox chips and empty-query Backspace", async () => {
    await render(
      <Combobox
        label="Environments"
        multiple
        defaultValue={["dev", "prod"]}
        options={[
          { value: "dev", label: "Development" },
          { value: "prod", label: "Production" }
        ]}
      />
    );
    await click('[aria-label="Remove Development"]');
    expect(document.querySelector('[aria-label="Remove Development"]')).toBeNull();
    await click('button[aria-label="Environments"]');
    await key(element('input[role="combobox"]'), "Backspace");
    expect(document.querySelector('[aria-label="Remove Production"]')).toBeNull();
  });
  it("lets an editor consume the first Escape before closing its Dialog", async () => {
    const Example = () => {
      const [editing, setEditing] = React.useState(true);
      return (
        <Dialog defaultOpen>
          <DialogContent>
            <DialogTitle>Editor</DialogTitle>
            <DialogDescription>Edit a value</DialogDescription>
            <button
              type="button"
              data-v4-escape-owner={editing ? "" : undefined}
              onKeyDown={(event) => {
                if (editing && event.key === "Escape") {
                  setEditing(false);
                  event.stopPropagation();
                }
              }}
            >
              Edit
            </button>
          </DialogContent>
        </Dialog>
      );
    };
    await render(<Example />);
    const button = element("[data-v4-escape-owner]");
    button.focus();
    await key(button, "Escape");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(button.hasAttribute("data-v4-escape-owner")).toBe(false);
    await key(button, "Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("names every slider thumb and handles toolbar focus without submitting a form", async () => {
    await render(
      <>
        <Slider defaultValue={[20, 80]} thumbLabels={["Minimum age", "Maximum age"]} />
        <ButtonGroup variant="toolbar" label="Text tools">
          <Button type="button">Bold</Button>
          <Button type="button" disabled>
            Italic
          </Button>
          <Button type="button">Underline</Button>
        </ButtonGroup>
      </>
    );
    expect(
      [...document.querySelectorAll('[role="slider"]')].map((node) =>
        node.getAttribute("aria-label")
      )
    ).toEqual(["Minimum age", "Maximum age"]);
    const toolbar = element('[role="toolbar"]');
    const buttons = [...toolbar.querySelectorAll("button")];
    buttons[0].focus();
    await key(buttons[0], "ArrowRight");
    expect(document.activeElement).toBe(buttons[2]);
    await key(buttons[2], "Home");
    expect(document.activeElement).toBe(buttons[0]);
  });
  it("preserves custom picker trigger refs, handlers and errors", async () => {
    const ref = React.createRef<HTMLButtonElement>();
    const ownRef = React.createRef<HTMLButtonElement>();
    const handler = vi.fn();
    await render(
      <Field label="Roles" error="Choose a role">
        <MultiSelect
          ref={ref}
          label="Roles"
          invalid
          trigger={
            <button ref={ownRef} onClick={handler}>
              Choose
            </button>
          }
          options={[{ value: "read", label: "Read" }]}
        />
      </Field>
    );
    const labels = [...document.querySelectorAll<HTMLLabelElement>("label")];
    expect(ref.current).toBe(ownRef.current);
    expect(ref.current?.getAttribute("aria-invalid")).toBe("true");
    expect(labels[0].htmlFor).toBe(ref.current?.id);
    await React.act(async () => ref.current?.click());
    expect(handler).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    await render(
      <Combobox label="Roles" multiple id="roles" aria-describedby="help" options={[]} />
    );
    expect(document.getElementById("roles")?.getAttribute("aria-describedby")).toBe("help");
  });
  it("ignores composing Enter and toggles enabled selections with Mod+A", async () => {
    const change = vi.fn();
    await render(
      <MultiSelect
        label="Roles"
        searchable
        defaultOpen
        defaultValue={["read", "locked"]}
        onChange={change}
        options={[
          { value: "read", label: "Read" },
          { value: "locked", label: "Locked", disabled: true }
        ]}
      />
    );
    const input = element("input");
    await React.act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          isComposing: true,
          bubbles: true,
          cancelable: true
        })
      );
    });
    expect(change).not.toHaveBeenCalled();
    await React.act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true, cancelable: true })
      );
    });
    expect(change).toHaveBeenLastCalledWith(["locked"]);
    await React.act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "a", metaKey: true, bubbles: true, cancelable: true })
      );
    });
    expect(change).toHaveBeenLastCalledWith(["read", "locked"]);
  });
  it.each([false, true])(
    "ignores stale option creation after a new query, multiple=%s",
    async (multiple) => {
      let complete: (() => void) | undefined;
      let signal: AbortSignal | undefined;
      const create = vi.fn((_query: string, context: { signal: AbortSignal }) => {
        signal = context.signal;
        return new Promise<void>((resolve) => {
          complete = resolve;
        });
      });
      await render(
        multiple ? (
          <Combobox label="Roles" multiple options={[]} onCreate={create} />
        ) : (
          <Combobox label="Roles" options={[]} onCreate={create} />
        )
      );
      await click('button[aria-label="Roles"]');
      const query = async (value: string) => {
        await React.act(async () => {
          const input = document.querySelector("input");
          if (!input) throw new Error("Missing input");
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
            input,
            value
          );
          input.dispatchEvent(new Event("input", { bubbles: true }));
        });
      };
      await query("old");
      const createRow = [...document.querySelectorAll<HTMLElement>("[cmdk-item],button")].find(
        (node) => node.textContent === 'Create "old"'
      );
      if (!createRow) throw new Error("Missing create option");
      await React.act(async () => createRow.click());
      expect(create).toHaveBeenCalledOnce();
      await click('button[aria-label="Roles"]');
      await click('button[aria-label="Roles"]');
      await query("new");
      expect(signal?.aborted).toBe(true);
      await React.act(async () => complete?.());
      expect(document.querySelector<HTMLInputElement>("input")?.value).toBe("new");
      expect(document.querySelector('[role="alert"]')).toBeNull();
    }
  );
  it("treats host AbortError as cancellation while retaining real creation failures", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"))
      .mockRejectedValueOnce(new Error("Denied"));
    await render(<Combobox label="Roles" options={[]} onCreate={create} />);
    await click('button[aria-label="Roles"]');
    await React.act(async () => {
      const input = document.querySelector("input");
      if (!input) throw new Error("Missing input");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "new");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("[cmdk-item]");
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector<HTMLInputElement>("input")?.value).toBe("new");
    await click("[cmdk-item]");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Could not create");
    expect(document.querySelector<HTMLInputElement>("input")?.value).toBe("new");
  });
  it("keeps parent-disabled custom triggers inert and identifies the popup as a listbox", async () => {
    const clickHandler = vi.fn();
    const capture = vi.fn();
    await render(
      <MultiSelect
        label="Roles"
        disabled
        trigger={
          <button type="button" disabled={false} onClick={clickHandler} onClickCapture={capture}>
            Choose
          </button>
        }
        options={[{ value: "read", label: "Read" }]}
      />
    );
    const button = document.querySelector("button");
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute("aria-haspopup")).toBe("listbox");
    await React.act(async () => button?.click());
    expect(clickHandler).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    await render(
      <MultiSelect
        label="Roles"
        trigger={
          <button type="button" onClick={clickHandler}>
            Choose
          </button>
        }
        options={[{ value: "read", label: "Read" }]}
      />
    );
    expect(document.querySelector("button")?.getAttribute("aria-haspopup")).toBe("listbox");
  });
});
