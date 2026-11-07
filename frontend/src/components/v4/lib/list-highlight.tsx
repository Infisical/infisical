import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

import { fade, snap, spring } from "./motion";

export const LIST_HIGHLIGHT_ITEM =
  '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [cmdk-item], [data-sidebar-target]';
const ACTIVE =
  '[data-highlighted], [cmdk-item][data-selected="true"], [role="option"][data-active]';
const CURRENT =
  '[data-current], [aria-current="page"], [role="option"][data-state="checked"], [role="menuitemradio"][aria-checked="true"]';
const HOLDS = "[data-holds-current]";
const EXPANDED = '[aria-haspopup]:is([aria-expanded="true"], [data-state="open"])';
const DANGER = '[data-danger], [data-variant="destructive"]';
const KEYS = ["ArrowDown", "ArrowUp", "Home", "End", "PageUp", "PageDown"];

type Thumb = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: string;
  danger: boolean;
  target: number;
  visible: boolean;
  placed: boolean;
  jump: boolean;
  first: boolean;
};
const hidden: Thumb = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  radius: "0px",
  danger: false,
  target: -1,
  visible: false,
  placed: false,
  jump: true,
  first: true
};

const blocked = (element: HTMLElement) =>
  element.hasAttribute("disabled") ||
  element.getAttribute("aria-disabled") === "true" ||
  (element.hasAttribute("data-disabled") && element.getAttribute("data-disabled") !== "false");

/** Offsets inside the list, through offsetParent, so open animations (scale, translate) never skew them. */
const offsetIn = (element: HTMLElement, list: HTMLElement) => {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = element;
  while (node && node !== list) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (parent && parent !== list && list.contains(parent)) {
      x += parent.clientLeft - parent.scrollLeft;
      y += parent.clientTop - parent.scrollTop;
    }
    node = parent && list.contains(parent) ? parent : null;
  }
  return { x, y };
};

/**
 * Two translucent thumbs per list. The hover thumb follows the pointer and the keyboard's active
 * row and stays on the last row while the pointer is anywhere in the list. A row whose popover,
 * flyout or submenu is open (aria-haspopup with aria-expanded="true" or data-state="open"; a
 * wrapping Tooltip overwrites data-state, so aria-expanded is the reliable signal) pins the hover
 * thumb until it closes, even after the pointer leaves for the popover. The selection thumb
 * rests on the current row and shows only while the hover thumb is hidden. Render it as the list's
 * last child; it measures its parent.
 */
export function ListHighlight() {
  const self = React.useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const [hover, setHover] = React.useState<Thumb>(hidden);
  const [selection, setSelection] = React.useState<Thumb>(hidden);

  React.useLayoutEffect(() => {
    const list = self.current?.parentElement;
    if (!list) return undefined;
    list.setAttribute("data-list-highlight", "");
    if (getComputedStyle(list).position === "static") list.style.position = "relative";
    const zone =
      (list.closest("[data-radix-popper-content-wrapper]")
        ?.firstElementChild as HTMLElement | null) ?? list;
    let hovered: HTMLElement | null = null;
    let keyboard = false;
    let inside = false;
    let frame = 0;
    const own = (element: Element | null) =>
      element instanceof HTMLElement && element.closest("[data-list-highlight]") === list
        ? element
        : null;
    const items = () =>
      [...list.querySelectorAll(LIST_HIGHLIGHT_ITEM)].map(own).filter(Boolean) as HTMLElement[];
    const first = (selector: string) => items().find((item) => item.matches(selector)) ?? null;
    const measureOne = (
      target: HTMLElement | null,
      set: React.Dispatch<React.SetStateAction<Thumb>>
    ) => {
      if (!target || !target.isConnected) {
        set((current) => (current.visible ? { ...current, visible: false, jump: false } : current));
        return;
      }
      const { x, y } = offsetIn(target, list);
      const all = items();
      set((current) => ({
        x,
        y,
        width: target.offsetWidth,
        height: target.offsetHeight,
        radius: getComputedStyle(target).borderRadius,
        danger: target.matches(DANGER),
        target: all.indexOf(target),
        visible: true,
        placed: true,
        jump: !current.placed || !current.visible,
        first: !current.placed
      }));
    };
    const measure = () => {
      frame = 0;
      const current = first(CURRENT) ?? first(HOLDS);
      const expanded = first(EXPANDED);
      let hoverTarget: HTMLElement | null = expanded && !blocked(expanded) ? expanded : null;
      if (!hoverTarget && keyboard) hoverTarget = first(ACTIVE) ?? current;
      else if (!hoverTarget && inside && hovered?.isConnected) hoverTarget = hovered;
      measureOne(hoverTarget, setHover);
      measureOne(hoverTarget ? null : current, setSelection);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const over = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      inside = true;
      const item = own(
        event.target instanceof Element ? event.target.closest(LIST_HIGHLIGHT_ITEM) : null
      );
      if (item && !blocked(item)) {
        hovered = item;
        keyboard = false;
      }
      schedule();
    };
    const leave = () => {
      inside = false;
      hovered = null;
      if (!list.contains(document.activeElement)) keyboard = false;
      schedule();
    };
    const key = (event: KeyboardEvent) => {
      if (!KEYS.includes(event.key)) return;
      if (
        !list.contains(document.activeElement) &&
        !list.contains(event.target as Node) &&
        !list.closest(":focus-within")
      )
        return;
      keyboard = true;
      schedule();
    };
    const focusOut = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && list.contains(event.relatedTarget)) return;
      keyboard = false;
      schedule();
    };
    zone.addEventListener("pointerover", over);
    zone.addEventListener("pointerleave", leave);
    list.addEventListener("focusout", focusOut);
    list.addEventListener("animationend", schedule);
    list.addEventListener("transitionend", schedule);
    document.addEventListener("keydown", key, true);
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    const watchItems = () => {
      if (!resize) return;
      resize.disconnect();
      resize.observe(list);
      items().forEach((item) => resize.observe(item));
    };
    watchItems();
    const mutations = new MutationObserver((records) => {
      if (records.some((record) => record.type === "childList")) watchItems();
      schedule();
    });
    mutations.observe(list, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "data-highlighted",
        "data-selected",
        "data-active",
        "data-current",
        "aria-current",
        "data-holds-current",
        "data-state",
        "aria-expanded",
        "aria-checked"
      ]
    });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      zone.removeEventListener("pointerover", over);
      zone.removeEventListener("pointerleave", leave);
      list.removeEventListener("focusout", focusOut);
      list.removeEventListener("animationend", schedule);
      list.removeEventListener("transitionend", schedule);
      document.removeEventListener("keydown", key, true);
      resize?.disconnect();
      mutations.disconnect();
      list.removeAttribute("data-list-highlight");
    };
  }, []);

  const thumb = (state: Thumb, kind: "hover" | "selection") => (
    <motion.span
      aria-hidden
      data-slot="list-highlight"
      data-thumb={kind}
      data-visible={state.visible || undefined}
      data-target={state.target}
      data-danger={state.danger || undefined}
      initial={false}
      style={{ borderRadius: state.radius }}
      animate={{
        x: state.x,
        y: state.y,
        width: state.width,
        height: state.height,
        opacity: state.visible ? 1 : 0
      }}
      transition={{
        default: state.jump || reduced ? snap : spring.moderate,
        opacity: reduced || state.first ? snap : fade.enter
      }}
    />
  );
  return (
    <span ref={self} data-slot="list-highlight-layer" style={{ display: "contents" }}>
      {thumb(selection, "selection")}
      {thumb(hover, "hover")}
    </span>
  );
}
