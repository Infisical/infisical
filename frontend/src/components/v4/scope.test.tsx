// @vitest-environment jsdom
import * as React from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChartStyle } from "./ui/chart";
import { useV4PortalContainer, useV4Theme, V4Scope } from "./scope";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Probe({ name }: { name: string }) {
  const theme = useV4Theme();
  const portal = useV4PortalContainer();
  return (
    <>
      <span data-probe={`${name}-wrapper`}>{theme}</span>
      {portal && createPortal(<span data-probe={`${name}-portal`}>{theme}</span>, portal)}
    </>
  );
}
const render = async (children: React.ReactNode) => {
  await React.act(async () => root.render(children));
};
const themedProbe = (name: string) => {
  const probe = document.querySelector(`[data-probe="${name}"]`);
  return { theme: probe?.closest(".v4")?.getAttribute("data-theme"), context: probe?.textContent };
};

describe("portable theme boundaries", () => {
  it.each([
    ["light", "dark"],
    ["dark", "light"]
  ] as const)("keeps explicit %s host and %s scope independent", async (outer, inner) => {
    host.dataset.theme = outer;
    await render(
      <V4Scope theme={inner}>
        <Probe name="explicit" />
      </V4Scope>
    );
    expect(themedProbe("explicit-wrapper")).toEqual({ theme: inner, context: inner });
    expect(themedProbe("explicit-portal")).toEqual({ theme: inner, context: inner });
    expect(host.dataset.theme).toBe(outer);
  });

  it("inherits the nearest valid ancestor and follows added, changed and removed theme attributes", async () => {
    host.dataset.theme = "dark";
    await render(
      <div data-theme="invalid" data-owner>
        <V4Scope>
          <Probe name="inherited" />
        </V4Scope>
      </div>
    );
    const owner = host.querySelector<HTMLElement>("[data-owner]");
    if (!owner) throw new Error("Missing theme owner");
    expect(themedProbe("inherited-wrapper").theme).toBe("dark");
    await React.act(async () => {
      owner.dataset.theme = "light";
    });
    expect(themedProbe("inherited-wrapper").theme).toBe("light");
    expect(themedProbe("inherited-portal")).toEqual({ theme: "light", context: "light" });
    await React.act(async () => {
      owner.removeAttribute("data-theme");
    });
    expect(themedProbe("inherited-portal")).toEqual({ theme: "dark", context: "dark" });
    await React.act(async () => {
      host.dataset.theme = "light";
    });
    expect(themedProbe("inherited-wrapper").theme).toBe("light");
  });

  it("updates nested opposite scopes and their independent body portals after prop changes", async () => {
    const tree = (theme: "light" | "dark") => (
      <V4Scope theme={theme}>
        <Probe name="outer" />
        <V4Scope theme="light">
          <Probe name="light" />
          <V4Scope theme="dark">
            <Probe name="dark" />
          </V4Scope>
        </V4Scope>
        <V4Scope>
          <Probe name="implicit" />
        </V4Scope>
      </V4Scope>
    );
    await render(tree("dark"));
    expect(themedProbe("light-wrapper").theme).toBe("light");
    expect(themedProbe("dark-portal").theme).toBe("dark");
    expect(themedProbe("implicit-portal").theme).toBe("dark");
    await render(tree("light"));
    expect(themedProbe("outer-portal").theme).toBe("light");
    expect(themedProbe("implicit-portal").theme).toBe("light");
    expect(themedProbe("dark-wrapper").theme).toBe("dark");
  });

  it("selects chart configuration colors from the resolved scope and updates them with the scope", async () => {
    host.dataset.theme = "dark";
    const config = { requests: { theme: { light: "#112233", dark: "#ddeeff" } } };
    const tree = (theme: "light" | "dark") => (
      <V4Scope theme={theme}>
        <ChartStyle id="scope-chart" config={config} />
      </V4Scope>
    );
    await render(tree("light"));
    expect(host.querySelector("style")?.textContent).toContain("--color-requests: #112233");
    expect(host.querySelector("style")?.textContent).not.toContain("#ddeeff");
    expect(host.querySelector("style")?.textContent).not.toContain("data-theme");
    await render(tree("dark"));
    expect(host.querySelector("style")?.textContent).toContain("--color-requests: #ddeeff");
    expect(host.querySelector("style")?.textContent).not.toContain("#112233");
  });

  it("cleans ancestor observers and forwarded refs when a wrapper remounts", async () => {
    const disconnects: Array<ReturnType<typeof vi.fn>> = [];
    const observations: MutationObserverInit[] = [];
    vi.stubGlobal(
      "MutationObserver",
      class {
        disconnect = vi.fn();
        constructor() {
          disconnects.push(this.disconnect);
        }
        observe = vi.fn((_node: Node, options: MutationObserverInit) => {
          observations.push(options);
        });
      }
    );
    const ref = React.createRef<HTMLDivElement>();
    await render(
      <V4Scope key="first" ref={ref}>
        <Probe name="first" />
      </V4Scope>
    );
    const first = ref.current;
    expect(first?.getAttribute("data-theme")).toBe("light");
    await render(
      <V4Scope key="second" ref={ref}>
        <Probe name="second" />
      </V4Scope>
    );
    expect(ref.current).not.toBe(first);
    expect(disconnects[0]).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-probe="first-portal"]')).toBeNull();
    expect(
      observations.every(
        (options) =>
          options.attributes && !options.subtree && options.attributeFilter?.join() === "data-theme"
      )
    ).toBe(true);
    await render(null);
    expect(ref.current).toBeNull();
    expect(disconnects.at(-1)).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-probe="second-portal"]')).toBeNull();
  });
});
