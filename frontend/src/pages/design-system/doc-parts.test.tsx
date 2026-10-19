// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { DocDisclosure, PageHeading, PreviewFrame } from "./doc-parts";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 0)
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const render = async (children: React.ReactNode) => {
  await React.act(async () => root.render(children));
};

const disclosure = () => {
  const trigger = host.querySelector<HTMLButtonElement>("button[aria-controls]");
  if (!trigger) throw new Error("Missing disclosure trigger");
  const content = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
  if (!content) throw new Error("Missing controlled content");
  return { trigger, content };
};

it("keeps the title and specimen separate without adding a Preview heading", async () => {
  await render(
    <>
      <PageHeading title="Button" />
      <PreviewFrame>
        <button type="button">Save changes</button>
      </PreviewFrame>
    </>
  );
  expect(host.querySelector("h1")?.textContent).toBe("Button");
  expect(host.querySelector("h1")?.parentElement?.children).toHaveLength(1);
  expect(host.textContent).not.toContain("Preview");
  expect(host.querySelector("button")?.textContent).toBe("Save changes");
  await render(<PreviewFrame label="Control heights">Controls</PreviewFrame>);
  expect(host.querySelector("h2")?.textContent).toBe("Control heights");
});

it("opens from a native focusable control and excludes closed content while retaining its state", async () => {
  const Draft = () => {
    const [count, setCount] = React.useState(0);
    return (
      <button type="button" onClick={() => setCount(count + 1)}>
        Draft {count}
      </button>
    );
  };
  await render(
    <DocDisclosure title="Usage and rules">
      <Draft />
    </DocDisclosure>
  );
  const { trigger, content } = disclosure();
  expect(trigger.type).toBe("button");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(content.hidden).toBe(true);
  expect(content.getAttribute("aria-hidden")).toBe("true");
  expect(content.hasAttribute("inert")).toBe(true);
  expect(content.querySelector("button")).toBeNull();

  trigger.focus();
  await React.act(async () => trigger.click());
  expect(document.activeElement).toBe(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(content.hidden).toBe(false);
  expect(content.hasAttribute("inert")).toBe(false);
  expect(content.getAttribute("aria-labelledby")).toBe(trigger.id);
  await React.act(async () => vi.advanceTimersByTime(16));
  expect(content.hasAttribute("data-open")).toBe(true);
  const draft = content.querySelector("button");
  if (!draft) throw new Error("Missing open disclosure content");
  await React.act(async () => draft.click());
  expect(draft.textContent).toBe("Draft 1");

  await React.act(async () => trigger.click());
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(content.getAttribute("aria-hidden")).toBe("true");
  expect(content.hasAttribute("inert")).toBe(true);
  expect(content.hasAttribute("data-open")).toBe(false);
  expect(content.hidden).toBe(false);
  expect(document.activeElement).toBe(trigger);
  await React.act(async () => vi.advanceTimersByTime(220));
  expect(content.hidden).toBe(true);

  await React.act(async () => trigger.click());
  expect(content.querySelector("button")).toBe(draft);
  expect(draft.textContent).toBe("Draft 1");
  expect(content.hidden).toBe(false);
});

it("settles reduced-motion changes immediately and accepts another toggle during opening", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  await render(<DocDisclosure title="Usage and rules">Guidance</DocDisclosure>);
  const { trigger, content } = disclosure();
  await React.act(async () => trigger.click());
  expect(content.hasAttribute("data-open")).toBe(true);
  expect(content.hidden).toBe(false);
  await React.act(async () => trigger.click());
  expect(content.hidden).toBe(true);
  expect(content.hasAttribute("data-open")).toBe(false);
  expect(content.hasAttribute("inert")).toBe(true);
  await React.act(async () => trigger.click());
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(content.textContent).toBe("Guidance");
  expect(content.hidden).toBe(false);
});
