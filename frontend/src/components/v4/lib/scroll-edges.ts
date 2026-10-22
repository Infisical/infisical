/**
 * Edge-aware scroll fade, ported from v3 useScrollEdges. Any element with data-scroll-fade="y",
 * "x" or "both" gets data-scroll-start-y / data-scroll-end-y (and -x) while more content sits
 * before or after the visible area; v4.css masks only those edges by size-scroll-fade. An area
 * that does not scroll gets no attribute and no fade. One document-level watcher serves every
 * V4Scope, so portaled menus and dialogs are covered too.
 */
const THRESHOLD = 1;
type Axis = "x" | "y";
const tracked = new WeakMap<HTMLElement, () => void>();
let started = 0;
let stop: (() => void) | null = null;

const axesOf = (element: HTMLElement): Axis[] => {
  const value = element.getAttribute("data-scroll-fade");
  if (value === "both") return ["x", "y"];
  return value === "x" ? ["x"] : ["y"];
};

const attach = (element: HTMLElement) => {
  if (tracked.has(element)) return;
  let frame = 0;
  const update = () => {
    frame = 0;
    axesOf(element).forEach((axis) => {
      const offset = axis === "y" ? element.scrollTop : Math.abs(element.scrollLeft);
      const size = axis === "y" ? element.clientHeight : element.clientWidth;
      const total = axis === "y" ? element.scrollHeight : element.scrollWidth;
      element.toggleAttribute(`data-scroll-start-${axis}`, offset > THRESHOLD);
      element.toggleAttribute(`data-scroll-end-${axis}`, offset + size < total - THRESHOLD);
    });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  element.addEventListener("scroll", schedule, { passive: true });
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
  resize?.observe(element);
  Array.from(element.children).forEach((child) => resize?.observe(child));
  const content = new MutationObserver(() => {
    Array.from(element.children).forEach((child) => resize?.observe(child));
    schedule();
  });
  content.observe(element, { childList: true, subtree: true, characterData: true });
  tracked.set(element, () => {
    cancelAnimationFrame(frame);
    element.removeEventListener("scroll", schedule);
    resize?.disconnect();
    content.disconnect();
  });
  update();
};

const sweep = (root: ParentNode) => {
  if (root instanceof HTMLElement && root.hasAttribute("data-scroll-fade")) attach(root);
  root.querySelectorAll<HTMLElement>("[data-scroll-fade]").forEach(attach);
};

/** Starts the shared watcher while at least one caller holds it; returns the release. */
export const watchScrollEdges = () => {
  if (typeof document === "undefined") return () => {};
  started += 1;
  if (started === 1) {
    sweep(document.body);
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) sweep(node);
        });
        record.removedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          [node, ...node.querySelectorAll<HTMLElement>("[data-scroll-fade]")].forEach((element) => {
            tracked.get(element)?.();
            tracked.delete(element);
          });
        });
        if (record.type === "attributes" && record.target instanceof HTMLElement)
          sweep(record.target);
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-scroll-fade"]
    });
    stop = () => observer.disconnect();
  }
  return () => {
    started -= 1;
    if (started === 0) stop?.();
  };
};
