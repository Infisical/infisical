import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: "http://localhost",
  pretendToBeVisual: true
});
for (const key of ["window", "document", "HTMLElement", "HTMLInputElement", "HTMLButtonElement", "Element", "Node", "NodeFilter", "MutationObserver", "CustomEvent", "Event", "MouseEvent", "KeyboardEvent", "DocumentFragment", "ShadowRoot"]) {
  globalThis[key] = dom.window[key];
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.CSS = { escape: (value) => value.replace(/[^\w-]/g, "\\$&") };
HTMLElement.prototype.scrollIntoView = () => {};
const React = await import("react");
const { act, createElement: h } = React;
const { createRoot } = await import("react-dom/client");
const { createPortal } = await import("react-dom");
const { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger, DialogClose, DialogPortal } = await import("../src/components/v3/generic/Dialog/Dialog.tsx");
const { Popover, PopoverContent, PopoverTrigger } = await import("../src/components/v3/generic/Popover/Popover.tsx");
const { Tooltip, TooltipContent, TooltipTrigger } = await import("../src/components/v3/generic/Tooltip/Tooltip.tsx");
const { ModalLayer, LayerPortal, ToastLayer } = await import("../src/components/overlays/OverlayLayer.tsx");

let root;
async function render(element) {
  root ??= createRoot(document.getElementById("root"));
  await act(async () => { root.render(element); });
}
afterEach(async () => {
  if (root) await act(async () => { root.unmount(); });
  root = undefined;
  assertSame(document.querySelectorAll("[data-overlay-layer]").length, 0, "unmount removes owned hosts");
  document.body.innerHTML = '<div id="root"></div>';
});
function content(name, children) {
  return h(DialogContent, { "data-testid": name },
    h(DialogTitle, null, name), h(DialogDescription, null, "Layer composition"), children);
}
const assertSame = (actual, expected, message) => assert.equal(actual === expected, true, message);
const hostOf = (id) => document.querySelector(`[data-testid="${id}"]`).closest('[data-overlay-layer="modal"]');

// These are DOM lifecycle tests. Paint order, geometry, and real keyboard navigation still need rendered verification.
test("sibling modal order follows opening order, including reopening a mounted root", async () => {
  const app = (a, b) => h(React.Fragment, null,
    h(Dialog, { open: a }, content("a")), h(Dialog, { open: b }, content("b")));
  await render(app(true, false));
  const firstHost = hostOf("a");
  await render(app(true, true));
  assertSame(firstHost.nextElementSibling, hostOf("b"));
  await render(app(false, true));
  assertSame(firstHost.isConnected, false);
  await render(app(true, true));
  assertSame(hostOf("b").nextElementSibling, hostOf("a"));
});

test("repeated nested dialogs own independent hosts outside content clipping", async () => {
  await render(h(Dialog, { open: true }, content("outer",
    h(Dialog, { open: true }, content("middle",
      h(Dialog, { open: true }, content("inner")))))));
  assertSame(hostOf("middle").parentElement.closest('[data-overlay-layer="modal"]'), hostOf("outer"));
  assertSame(hostOf("inner").parentElement.closest('[data-overlay-layer="modal"]'), hostOf("middle"));
  assertSame(document.querySelector('[data-testid="outer"] > [data-slot="dialog-content"]').contains(hostOf("middle")), false);
});

test("floating popovers and tooltips use the owning modal host", async () => {
  await render(h(Dialog, { open: true }, content("owner",
    h(Popover, { open: true },
      h(PopoverTrigger, null, "Details"),
      h(PopoverContent, { "data-testid": "popover" },
        h(Tooltip, { open: true },
          h(TooltipTrigger, null, "Help"), h(TooltipContent, { "data-testid": "tooltip" }, "Help text")))))));
  const host = hostOf("owner");
  assertSame(document.querySelector('[data-testid="popover"]').closest('[data-overlay-layer]'), host);
  assertSame(document.querySelector('[data-testid="tooltip"]').closest('[data-overlay-layer]'), host);
  assertSame(document.querySelector('[data-testid="owner"] > [data-slot="dialog-content"]').contains(document.querySelector('[data-testid="popover"]')), false);
  const popup = document.querySelector('[data-testid="popover"]');
  assertSame(popup.closest('[aria-hidden="true"]') === null, true, "owned popup must remain accessible");
  const input = document.createElement("input");
  popup.appendChild(input);
  input.focus();
  assertSame(document.activeElement === input, true, "dialog focus trap includes portalled inputs");
  popup.style.overflowY = "auto";
  Object.defineProperties(popup, { scrollHeight: { value: 300 }, clientHeight: { value: 100 } });
  const wheel = new window.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 10 });
  popup.dispatchEvent(wheel);
  assertSame(wheel.defaultPrevented, false, "owning dialog must not block scrolling its portalled popup");
});

test("uncontrolled open and close preserve focus return and notify the caller", async () => {
  const changes = [];
  await render(h(Dialog, { onOpenChange: (open) => changes.push(open) },
    h(DialogTrigger, { "data-testid": "trigger" }, "Open"),
    content("focus", h(DialogClose, { "data-testid": "close" }, "Finish"))));
  const trigger = document.querySelector('[data-testid="trigger"]');
  await act(async () => { trigger.focus(); trigger.click(); });
  assert.ok(hostOf("focus"));
  await act(async () => { document.querySelector('[data-testid="close"]').click(); });
  // FocusScope defers unmount autofocus to the next task.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  assert.deepEqual(changes, [true, false]);
  assertSame(document.activeElement, trigger);
});

test("closing does not remove a host while portal exit content remains", async () => {
  const portal = ({ container, children }) => createPortal(children, container);
  const app = (open, exiting) => h(ModalLayer, { open }, () =>
    h(LayerPortal, { portal, modal: true }, exiting ? h("div", { "data-testid": "exit" }) : null));
  await render(app(true, true));
  const host = hostOf("exit");
  await render(app(false, true));
  assertSame(host.isConnected, true);
  await render(app(false, false));
  assertSame(host.isConnected, false);
});

test("toast-owned dialogs nest above the toast plane and clean up with their owner", async () => {
  await render(h(ToastLayer, null, h(Dialog, { open: true }, content("toast-dialog"))));
  assertSame(hostOf("toast-dialog").parentElement.dataset.overlayLayer, "toast");
  assertSame(hostOf("toast-dialog").parentElement.parentElement, document.body);
});

test("force-mounted portals retain their host while the root is closed", async () => {
  await render(h(Dialog, { open: false }, h(DialogPortal, { forceMount: true }, h("div", { "data-testid": "forced" }))));
  assert.ok(hostOf("forced"));
});

test("an explicit floating portal container remains supported", async () => {
  const custom = document.createElement("div");
  document.body.appendChild(custom);
  await render(h(Popover, { open: true }, h(PopoverTrigger, null, "Open"),
    h(PopoverContent, { container: custom, "data-testid": "custom" }, "Custom target")));
  assertSame(custom.contains(document.querySelector('[data-testid="custom"]')), true);
});

test("semantic utilities compile and ordering separates content, controls, modals, and toasts", async () => {
  const { compile } = await import("tailwindcss");
  const css = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
  const tokens = [...css.matchAll(/--z-index-layer-([a-z]+): (\d+);/g)];
  const values = Object.fromEntries(tokens.map(([, name, value]) => [name, Number(value)]));
  assert.ok(values.backdrop < values.content);
  assert.ok(values.content < values.floating && values.floating < values.tooltip);
  assert.ok(values.tooltip < values.modal && values.modal < values.toast);
  assert.ok(values.action < values.floating);
  const compiler = await compile(`@theme { ${tokens.map(([definition]) => definition).join("\n")} } @tailwind utilities;`);
  const output = compiler.build(tokens.map(([, name]) => `z-layer-${name}`));
  for (const [, name] of tokens) assert.ok(output.includes(`.z-layer-${name}`), name);
});

test("legacy overlays give ReactSelect menus and their tooltips the same owner", async () => {
  const { Modal, ModalContent } = await import("../src/components/v2/Modal/Modal.tsx");
  const { Drawer, DrawerContent } = await import("../src/components/v2/Drawer/Drawer.tsx");
  const { FilterableSelect } = await import("../src/components/v2/FilterableSelect/FilterableSelect.tsx");
  await render(h(Modal, { isOpen: true }, h(ModalContent, { title: "Legacy modal" },
    h(Drawer, { isOpen: true }, h(DrawerContent, { title: "Legacy drawer", "data-testid": "legacy-drawer" },
      h(FilterableSelect, { menuIsOpen: true, options: [{ label: "Production", value: "prod" }],
        formatOptionLabel: (option) => h(Tooltip, { open: true },
          h(TooltipTrigger, null, option.label), h(TooltipContent, { "data-testid": "option-tip" }, "Environment access"))
      }))))));
  const drawerHost = hostOf("legacy-drawer");
  const menu = document.querySelector(".react-select-menu-portal");
  assert.ok(menu);
  assertSame(menu.closest('[data-overlay-layer="modal"]'), drawerHost);
  assertSame(document.querySelector('[data-testid="option-tip"]').closest('[data-overlay-layer="modal"]'), drawerHost);
  assertSame(menu.closest('[aria-hidden="true"]') === null, true);
});

test("StrictMode does not leak hosts or lose the mounted interaction scope", async () => {
  await render(h(React.StrictMode, null, h(Dialog, { defaultOpen: true }, content("strict"))));
  assertSame(document.querySelectorAll('[data-overlay-layer="modal"]').length, 1);
  assert.ok(hostOf("strict"));
});

test("Radix exit presence keeps the panel and host until the scope animation ends", async (t) => {
  // Browsers return a live CSSStyleDeclaration; jsdom returns a snapshot.
  const originalGetComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = (element) => new Proxy(originalGetComputedStyle(element), {
    get(_target, key) {
      const current = originalGetComputedStyle(element);
      const value = current[key];
      return typeof value === "function" ? value.bind(current) : value;
    }
  });
  t.after(() => { globalThis.getComputedStyle = originalGetComputedStyle; });
  const style = document.createElement("style");
  style.textContent = '.overlay-content-scope[data-state="closed"] { animation-name: overlay-content-exit; }';
  document.body.appendChild(style);
  await render(h(Dialog, { open: true }, content("animated")));
  const scope = document.querySelector('[data-testid="animated"]');
  const host = hostOf("animated");
  await render(h(Dialog, { open: false }, content("animated")));
  assertSame(scope.isConnected, true, "closing scope retains the exiting panel");
  assertSame(host.isConnected, true, "closing host retains Radix presence");
  await act(async () => {
    const event = new window.Event("animationend", { bubbles: true });
    Object.defineProperty(event, "animationName", { value: "overlay-content-exit" });
    scope.dispatchEvent(event);
  });
  assertSame(host.isConnected, false, "host is removed after the final exit animation");
});
