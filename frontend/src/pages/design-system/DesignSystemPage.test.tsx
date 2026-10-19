// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useRouterState
} from "@tanstack/react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "@app/components/v3/platform/ThemeProvider/ThemeProvider";
import { analytics } from "@app/lib/analytics";

import { loadAgentDocument } from "./agent-source";
import { DesignSystemPage } from "./DesignSystemPage";

vi.mock("@app/lib/analytics", () => ({
  analytics: { captureThemePreferenceChanged: vi.fn() }
}));

const ProductPage = () => {
  const { theme, resolvedTheme } = useTheme();
  return (
    <p>
      {theme}/{resolvedTheme}
    </p>
  );
};

const ThemeLayout = () => {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <ThemeProvider pathname={pathname}>
      <Outlet />
    </ThemeProvider>
  );
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", function ResizeObserverMock() {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  });
  window.location.hash = "";
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: () => true
  }));
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    clear: () => {
      storage.clear();
    }
  });
  window.localStorage.setItem("infisical-theme", "dark");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const waitForPage = async (id: string) =>
  vi.waitFor(
    async () => {
      await React.act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
      });
      expect(document.querySelector("main")?.id).toBe(id);
    },
    { timeout: 5000 }
  );

it("keeps docs, persisted preference and product consumers on the provider's theme", async () => {
  const rootRoute = createRootRoute({ component: ThemeLayout });
  const docsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/design-system",
    component: DesignSystemPage
  });
  const productRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: ProductPage
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([docsRoute, productRoute]),
    history: createMemoryHistory({ initialEntries: ["/design-system"] })
  });
  await React.act(async () => {
    await router.load();
    root.render(<RouterProvider<typeof router> router={router} />);
  });
  const toggle = [...document.querySelectorAll("button")].find(
    (button) => button.getAttribute("aria-label") === "Switch to light theme"
  );
  expect(toggle).toBeDefined();
  await React.act(async () => toggle?.click());
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(window.localStorage.getItem("infisical-theme")).toBe("light");
  expect(analytics.captureThemePreferenceChanged).toHaveBeenCalledWith({
    source: "design-system",
    theme: "light",
    resolvedTheme: "light"
  });
  await React.act(async () => {
    await router.navigate({ to: "/" });
  });
  expect(host.textContent).toBe("light/light");
  expect(document.documentElement.dataset.theme).toBe("light");
  await React.act(async () => {
    await router.navigate({ to: "/design-system" });
  });
  await React.act(async () => {
    window.dispatchEvent(new StorageEvent("storage", { key: "infisical-theme", newValue: "dark" }));
  });
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(
    [...document.querySelectorAll("button")].some(
      (button) => button.getAttribute("aria-label") === "Switch to light theme"
    )
  ).toBe(true);
});

it.each(["#button", "#button-directions"])(
  "keeps %s while switching human examples to exact agent Markdown and back",
  async (address) => {
    window.location.hash = address;
    const rootRoute = createRootRoute({ component: ThemeLayout });
    const docsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/design-system",
      component: DesignSystemPage
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([docsRoute]),
      history: createMemoryHistory({ initialEntries: ["/design-system"] })
    });
    await React.act(async () => {
      await router.load();
      root.render(<RouterProvider<typeof router> router={router} />);
    });
    await waitForPage("button");
    expect(host.querySelector('main[data-document-view="human"]')).not.toBeNull();
    expect(host.querySelector('[data-component="button"]')).not.toBeNull();
    expect(host.textContent).not.toContain("View code");
    expect(host.textContent).not.toContain("API source and verification recipes");
    expect(host.querySelector('button[aria-label^="Corners: square"]')).not.toBeNull();
    const agent = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Agent"
    );
    await React.act(async () => agent?.click());
    await React.act(async () => {
      await loadAgentDocument("button");
    });
    expect(window.location.hash).toBe(address);
    expect(agent?.getAttribute("aria-checked")).toBe("true");
    const markdown = host.querySelector("[data-agent-markdown]");
    expect(markdown?.textContent).toContain("# Button");
    expect(markdown?.textContent).toContain("## Executable examples");
    expect(host.querySelector('[data-component="button"]')).toBeNull();
    const clipboard = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboard }
    });
    try {
      const copy = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "Copy Markdown"
      );
      await React.act(async () => copy?.click());
      expect(clipboard).toHaveBeenCalledWith(markdown?.textContent);
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
    const human = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Human"
    );
    await React.act(async () => human?.click());
    expect(window.location.hash).toBe(address);
    expect(human?.getAttribute("aria-checked")).toBe("true");
    expect(host.querySelector('[data-component="button"]')).not.toBeNull();
    expect(host.querySelector("[data-agent-markdown]")).toBeNull();
    const notes = [...host.querySelectorAll<HTMLButtonElement>("button")].filter(
      (node) => node.textContent === "Usage and rules"
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]?.getAttribute("aria-expanded")).toBe("false");
    const contentId = notes[0]?.getAttribute("aria-controls");
    expect(contentId).toBeTruthy();
    const notesContent = document.getElementById(contentId ?? "");
    expect(notesContent?.hidden).toBe(true);
    expect(notesContent?.hasAttribute("inert")).toBe(true);
    notes[0]?.focus();
    await React.act(async () => notes[0]?.click());
    expect(notes[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(notesContent?.hidden).toBe(false);
    expect(notesContent?.textContent).toContain("Accessibility");
    expect(notesContent?.textContent).not.toContain("Behavior");
    expect(notesContent?.textContent).not.toContain("Limits");
    const usageRule = notesContent?.querySelector("#rule-button-usage");
    expect(usageRule?.textContent).toContain("button-usage");
    expect(usageRule?.textContent).toContain("Checked in review.");
    expect(document.activeElement).toBe(notes[0]);
    expect(host.textContent).not.toContain("Workbench / in progress");
    expect(host.querySelector("[data-documentation-dock]")?.contains(human ?? null)).toBe(true);
    expect(host.querySelector("header")).toBeNull();
    human?.focus();
    await React.act(async () => {
      human?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })
      );
    });
    await React.act(
      async () =>
        new Promise((resolve) => {
          setTimeout(resolve, 0);
        })
    );
    expect(document.activeElement).toBe(agent);
    window.location.hash = "";
  }
);

it("opens compact mobile navigation, follows a destination and restores its stable trigger", async () => {
  window.location.hash = "#button";
  const rootRoute = createRootRoute({ component: ThemeLayout });
  const docsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/design-system",
    component: DesignSystemPage
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([docsRoute]),
    history: createMemoryHistory({ initialEntries: ["/design-system"] })
  });
  await React.act(async () => {
    await router.load();
    root.render(<RouterProvider<typeof router> router={router} />);
  });
  const trigger = host.querySelector<HTMLButtonElement>(
    '[aria-label="Open documentation navigation"]'
  );
  expect(trigger?.textContent).toBe("");
  expect(host.querySelector("select")).toBeNull();
  expect(host.querySelector("header")).toBeNull();
  trigger?.focus();
  await React.act(async () => trigger?.click());
  let panel = document.querySelector('[data-slot="sheet-content"]');
  expect(panel?.getAttribute("role")).toBe("dialog");
  expect(panel?.querySelector('img[alt="Infisical"]')?.getAttribute("src")).toContain(
    "infisical-logo.svg"
  );
  expect(document.activeElement).toBe(panel?.querySelector('a[aria-current="page"]'));
  const colors = panel?.querySelector<HTMLAnchorElement>('a[href="#colors"]');
  await React.act(async () => colors?.click());
  await React.act(
    async () =>
      new Promise((resolve) => {
        setTimeout(resolve, 0);
      })
  );
  expect(window.location.hash).toBe("#colors");
  expect(host.querySelector("main")?.id).toBe("colors");
  expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull();
  expect(trigger?.isConnected).toBe(true);
  expect(document.activeElement).toBe(trigger);
  await React.act(async () => trigger?.click());
  panel = document.querySelector('[data-slot="sheet-content"]');
  expect(document.activeElement).toBe(panel?.querySelector('a[href="#colors"]'));
  await React.act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    )
  );
  await React.act(
    async () =>
      new Promise((resolve) => {
        setTimeout(resolve, 0);
      })
  );
  expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  const dock = host.querySelector("[data-documentation-dock]");
  expect(dock?.querySelector('[aria-label="Documentation view"]')).not.toBeNull();
  expect(dock?.querySelector('[aria-label="Switch to light theme"]')).not.toBeNull();
});

it("keeps the current page on screen until the next page's examples have loaded", async () => {
  window.location.hash = "#badge";
  const rootRoute = createRootRoute({ component: ThemeLayout });
  const docsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/design-system",
    component: DesignSystemPage
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([docsRoute]),
    history: createMemoryHistory({ initialEntries: ["/design-system"] })
  });
  await React.act(async () => {
    await router.load();
    root.render(<RouterProvider<typeof router> router={router} />);
  });
  await waitForPage("badge");
  let fallbackSeen = false;
  const watcher = new MutationObserver(() => {
    if (host.textContent?.includes("Loading example")) fallbackSeen = true;
  });
  watcher.observe(host, { subtree: true, childList: true, characterData: true });
  await React.act(async () => {
    window.location.hash = "#avatar";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  await waitForPage("avatar");
  watcher.disconnect();
  expect(fallbackSeen).toBe(false);
  expect(host.querySelector('[data-example-state="loading"]')).toBeNull();
  expect(host.querySelector('a[aria-current="page"]')?.getAttribute("href")).toBe("#avatar");
  window.location.hash = "";
});
