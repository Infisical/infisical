// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
import { Button, buttonVariants } from "./button";
import { DropdownMenu, DropdownMenuTrigger } from "./dropdown-menu";
import { Icon, iconNames } from "./icon";
import { Popover, PopoverTrigger } from "./popover";
import { Spinner } from "./spinner";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});
const render = async (child: React.ReactNode) => {
  await React.act(async () => root.render(child));
};

describe("brand runtime", () => {
  it("renders every owned icon as SVG geometry and forwards its ref", async () => {
    const ref = React.createRef<SVGSVGElement>();
    await render(
      <>
        {iconNames.map((name) => (
          <Icon key={name} name={name} />
        ))}
        <Icon name="search" label="Search" ref={ref} />
      </>
    );
    expect(iconNames).toHaveLength(52);
    expect(host.querySelectorAll("svg")).toHaveLength(53);
    expect(host.querySelectorAll("script, foreignObject, image, use")).toHaveLength(0);
    expect(ref.current?.getAttribute("aria-label")).toBe("Search");
    expect(host.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
  it("uses the brand mark at all sizes with one spinner announcement", async () => {
    await render(
      <>
        <Spinner />
        <Spinner size="base" />
        <Spinner size="page" label="Loading secrets" description="Fetching project data" />
      </>
    );
    expect([...host.querySelectorAll("svg")].map((svg) => svg.getAttribute("viewBox"))).toEqual([
      "0 0 16 8",
      "0 0 47 23",
      "0 0 159 79"
    ]);
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Loading secretsFetching project data"
    );
    expect(host.querySelectorAll("svg[aria-hidden=true]")).toHaveLength(3);
  });
  it("cancels a delayed spinner after unmount", async () => {
    vi.useFakeTimers();
    await render(<Spinner delay={300} label="Loading" />);
    expect(host.textContent).toBe("");
    await React.act(async () => vi.advanceTimersByTime(299));
    expect(host.textContent).toBe("");
    await React.act(async () => vi.advanceTimersByTime(1));
    expect(host.textContent).toBe("Loading");
    await render(<Spinner key="new" delay={300} label="Loading" />);
    await render(null);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps a loading action's label and blocks native and slotted clicks", async () => {
    const click = vi.fn();
    const capture = vi.fn();
    const ref = React.createRef<HTMLButtonElement>();
    await render(
      <Button ref={ref} loading icon="search" onClick={click}>
        Search secrets
      </Button>
    );
    expect(ref.current?.textContent).toBe("Search secrets");
    expect(ref.current?.getAttribute("aria-busy")).toBe("true");
    await React.act(async () => ref.current?.click());
    expect(click).not.toHaveBeenCalled();
    await render(
      <Button asChild loading icon="search">
        <a href="#search" onClick={click} onClickCapture={capture}>
          Search secrets
        </a>
      </Button>
    );
    const link = host.querySelector("a");
    expect(link?.textContent).toBe("Search secrets");
    let allowed = true;
    await React.act(async () => {
      allowed =
        link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })) ?? true;
    });
    expect(allowed).toBe(false);
    expect(capture).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    await render(<Button onClick={click}>Search secrets</Button>);
    await React.act(async () => host.querySelector("button")?.click());
    expect(click).toHaveBeenCalledOnce();
  });
  it("keeps an icon-only button's supplied label available to assistive technology", async () => {
    await render(
      <Button iconOnly icon="plus">
        Add secret
      </Button>
    );
    const button = host.querySelector("button");
    expect(button?.querySelector(".sr-only")?.textContent).toBe("Add secret");
    expect(button?.textContent).toBe("Add secret");
  });
  it("retains its brand marker and size when a Radix asChild trigger replaces the slot", async () => {
    await render(
      <>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="destructive">Default trigger</Button>
          </PopoverTrigger>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm">Compact trigger</Button>
          </PopoverTrigger>
        </Popover>
        <Button asChild>
          <a href="#details">Details</a>
        </Button>
      </>
    );
    const buttons = [...host.querySelectorAll("button")];
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.getAttribute("data-slot") === "popover-trigger")).toBe(
      true
    );
    expect(buttons.every((button) => button.hasAttribute("data-v4-button"))).toBe(true);
    expect(buttons.map((button) => button.getAttribute("data-size"))).toEqual(["default", "sm"]);
    expect(buttons[0].getAttribute("data-variant")).toBe("destructive");
    expect(host.querySelector("a")?.hasAttribute("data-v4-button")).toBe(true);
  });
  it("preserves pending content, ref and reserved indicator across controlled loading changes", async () => {
    const ref = React.createRef<HTMLButtonElement>();
    const click = vi.fn();
    const action = (loading: boolean) => (
      <Button ref={ref} loading={loading} icon="plus" onClick={click}>
        Create project
      </Button>
    );
    await render(action(false));
    const button = ref.current;
    const progress = button?.querySelector('[data-slot="button-progress"]');
    expect(progress?.getAttribute("aria-hidden")).toBe("true");
    expect(progress?.hasAttribute("data-active")).toBe(false);
    expect(button?.querySelectorAll("svg")).toHaveLength(2);
    await render(action(true));
    expect(ref.current).toBe(button);
    expect(button?.querySelector('[data-slot="button-progress"]')).toBe(progress);
    expect(progress?.hasAttribute("data-active")).toBe(true);
    expect(button?.textContent).toBe("Create project");
    await React.act(async () => button?.click());
    expect(click).not.toHaveBeenCalled();
    await render(action(false));
    await React.act(async () => button?.click());
    expect(click).toHaveBeenCalledOnce();
    await render(<Button>Create project</Button>);
    expect(host.querySelector('[data-slot="button-progress"]')).toBeNull();
  });
  it("keeps loading icon-only actions named without rendering overlapping icons", async () => {
    await render(
      <Button loading iconOnly icon="plus">
        Create project
      </Button>
    );
    const button = host.querySelector("button");
    expect(button?.querySelectorAll("svg")).toHaveLength(1);
    expect(button?.querySelector(".sr-only")?.textContent).toBe("Create project");
    expect(button?.getAttribute("aria-busy")).toBe("true");
  });
  it.each([{ disabled: true }, { "aria-disabled": true }])(
    "blocks disabled slotted anchor handlers and navigation %j",
    async (disabledProps) => {
      const click = vi.fn();
      const capture = vi.fn();

      await render(
        <Button asChild {...disabledProps}>
          <a href="#create" onClick={click} onClickCapture={capture}>
            Create project
          </a>
        </Button>
      );
      let allowed = true;
      await React.act(async () => {
        allowed =
          host
            .querySelector("a")
            ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })) ?? true;
      });
      expect(allowed).toBe(false);
      expect(click).not.toHaveBeenCalled();
      expect(capture).not.toHaveBeenCalled();
    }
  );
  it("returns the same material from the public variant helper for all primary aliases", async () => {
    await render(
      <>
        <Button>Save</Button>
        <button className={buttonVariants({ variant: "primary" })}>Save</button>
        <button className={buttonVariants({ variant: "accent" })}>Save</button>
      </>
    );
    const buttons = [...host.querySelectorAll("button")];
    expect(buttons[0]?.className).toBe(buttons[1]?.className);
    expect(buttons[1]?.className).toBe(buttons[2]?.className);
  });
  it("blocks pending Radix menu pointer and keyboard activation before click without swallowing Tab", async () => {
    const open = vi.fn();
    const key = vi.fn();
    await render(
      <DropdownMenu onOpenChange={open}>
        <DropdownMenuTrigger asChild>
          <Button loading onKeyDownCapture={key}>
            Project actions
          </Button>
        </DropdownMenuTrigger>
      </DropdownMenu>
    );
    const button = host.querySelector("button");
    await React.act(async () => {
      button?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 })
      );
      ["Enter", " ", "ArrowDown"].forEach((name) => {
        button?.dispatchEvent(
          new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })
        );
      });
    });
    expect(open).not.toHaveBeenCalled();
    expect(key).not.toHaveBeenCalled();
    await React.act(async () => {
      button?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
      );
    });
    expect(key).toHaveBeenCalledOnce();
  });
  it("gates slotted child capture handlers on pending activation while preserving other keys", async () => {
    const pointer = vi.fn();
    const key = vi.fn();
    await render(
      <Button asChild loading aria-haspopup="menu">
        <a href="#actions" onPointerDownCapture={pointer} onKeyDownCapture={key}>
          Project actions
        </a>
      </Button>
    );
    const link = host.querySelector("a");
    await React.act(async () => {
      link?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
      link?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
      );
    });
    expect(pointer).not.toHaveBeenCalled();
    expect(key).not.toHaveBeenCalled();
    await React.act(async () => {
      link?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
      );
    });
    expect(key).toHaveBeenCalledOnce();
  });
  it("preserves arrow navigation for an explicitly absent popup while guarding activation", async () => {
    const key = vi.fn();
    await render(
      <Button loading aria-haspopup="false" onKeyDownCapture={key}>
        Save
      </Button>
    );
    await React.act(async () => {
      ["ArrowUp", "ArrowDown", "Enter", " "].forEach((name) => {
        host
          .querySelector("button")
          ?.dispatchEvent(
            new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })
          );
      });
    });
    expect(key.mock.calls.map(([event]) => event.key)).toEqual(["ArrowUp", "ArrowDown"]);
  });
  it.each(["outline", "secondary", "ghost"] as const)(
    "keeps %s selection owner-controlled with a persistent pressed state",
    async (variant) => {
      const change = vi.fn();
      await render(
        <Button variant={variant} selected={false} aria-pressed="mixed" onClick={change}>
          Show preview
        </Button>
      );
      const button = host.querySelector("button");
      expect(button?.getAttribute("aria-pressed")).toBe("false");
      await React.act(async () => button?.click());
      expect(change).toHaveBeenCalledOnce();
      expect(button?.getAttribute("aria-pressed")).toBe("false");
      await render(
        <Button variant={variant} selected onClick={change}>
          Show preview
        </Button>
      );
      expect(host.querySelector("button")).toBe(button);
      expect(button?.getAttribute("aria-pressed")).toBe("true");
      expect(button?.textContent).toBe("Show preview");
    }
  );
  it("keeps compiled scoped outline and transition resets off material Buttons and public helpers", async () => {
    await render(
      <V4Scope>
        <Button>Save changes</Button>
        <button className={buttonVariants({ variant: "primary" })}>Primary helper</button>
        <button className={buttonVariants({ variant: "accent" })}>Accent helper</button>
        <Button variant="outline">Cancel</Button>
      </V4Scope>
    );
    const [{ default: postcss }, { default: tailwind }] = await Promise.all([
      import("postcss"),
      import("@tailwindcss/postcss")
    ]);
    const stylesheet = path.resolve("src/components/v4/v4.css");
    const compiled = await postcss([tailwind()]).process(await readFile(stylesheet, "utf8"), {
      from: stylesheet
    });
    [".outline-none", ".transition-all"].forEach((utility) => {
      const resetTargets: string[] = [];
      let foundScopedReset = false;
      compiled.root.walkRules(utility, (rule) => {
        if (rule.parent?.type !== "rule" || rule.parent.selector !== ".v4") return;
        foundScopedReset = true;
        const scopedSelector = `${rule.parent.selector} ${rule.selector}`;
        host.querySelectorAll("button").forEach((button) => {
          if (button.matches(scopedSelector)) resetTargets.push(button.textContent ?? "");
        });
      });
      expect(foundScopedReset, utility).toBe(true);
      expect(resetTargets, utility).toEqual([]);
    });
  });
});
