import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

import { exit, fade, snap, spring } from "./motion";

export const LIST_HIGHLIGHT_ITEM =
  '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [cmdk-item], [data-sidebar-target]';
const ACTIVE =
  '[data-highlighted], [cmdk-item][data-selected="true"], [role="option"][data-active]';
const OPEN = '[aria-haspopup][data-state="open"]';
const CURRENT =
  '[data-current], [aria-current="page"], [role="option"][data-state="checked"], [role="menuitemradio"][aria-checked="true"]';
const HOLDS = "[data-holds-current]";
const DANGER = '[data-danger], [data-variant="destructive"]';
const KEYS = ["ArrowDown", "ArrowUp", "Home", "End", "PageUp", "PageDown"];

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: string;
  danger: boolean;
  visible: boolean;
  jump: boolean;
};

const blocked = (element: HTMLElement) =>
  element.hasAttribute("disabled") ||
  element.getAttribute("aria-disabled") === "true" ||
  (element.hasAttribute("data-disabled") && element.getAttribute("data-disabled") !== "false");

/**
 * One translucent block per list. It rests on the current row, glides to the row under the
 * pointer or the keyboard's active row, glides back when the pointer leaves, and fades out when
 * no row is current. Render it as the first child of the list; it measures its parent.
 */
export function ListHighlight() {
  const self = React.useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const [box, setBox] = React.useState<Box>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    radius: "0px",
    danger: false,
    visible: false,
    jump: true
  });

  React.useLayoutEffect(() => {
    const list = self.current?.parentElement;
    if (!list) return undefined;
    list.setAttribute("data-list-highlight", "");
    if (getComputedStyle(list).position === "static") list.style.position = "relative";
    let hovered: HTMLElement | null = null;
    let keyboard = false;
    let frame = 0;
    let shown = false;
    const own = (element: Element | null) =>
      element instanceof HTMLElement && element.closest("[data-list-highlight]") === list
        ? element
        : null;
    const first = (selector: string) =>
      [...list.querySelectorAll(selector)].map(own).find(Boolean) ?? null;
    const focusedItem = () => {
      const active = document.activeElement;
      return active instanceof Element && active.matches(":focus-visible")
        ? own(active.closest(LIST_HIGHLIGHT_ITEM))
        : null;
    };
    const measure = () => {
      frame = 0;
      const target = [
        hovered,
        keyboard ? (first(ACTIVE) ?? focusedItem()) : null,
        first(OPEN),
        first(CURRENT),
        first(HOLDS)
      ].find((element) => element?.isConnected && !blocked(element));
      if (!target) {
        shown = false;
        setBox((current) =>
          current.visible ? { ...current, visible: false, jump: false } : current
        );
        return;
      }
      const outer = list.getBoundingClientRect();
      const inner = target.getBoundingClientRect();
      const next = {
        x: inner.left - outer.left - list.clientLeft + list.scrollLeft,
        y: inner.top - outer.top - list.clientTop + list.scrollTop,
        width: inner.width,
        height: inner.height,
        radius: getComputedStyle(target).borderRadius,
        danger: target.matches(DANGER),
        visible: true,
        jump: !shown
      };
      shown = true;
      setBox(next);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const over = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      keyboard = false;
      hovered = own(
        event.target instanceof Element ? event.target.closest(LIST_HIGHLIGHT_ITEM) : null
      );
      schedule();
    };
    const leave = () => {
      hovered = null;
      schedule();
    };
    const key = (event: KeyboardEvent) => {
      if (!KEYS.includes(event.key) && !(event.key === "Tab" || event.key.length === 1)) return;
      keyboard = true;
      hovered = null;
      schedule();
    };
    list.addEventListener("pointerover", over);
    list.addEventListener("pointerleave", leave);
    list.addEventListener("focusin", schedule);
    list.addEventListener("focusout", schedule);
    document.addEventListener("keydown", key, true);
    const resize = new ResizeObserver(schedule);
    const watchItems = () => {
      resize.disconnect();
      resize.observe(list);
      list.querySelectorAll(LIST_HIGHLIGHT_ITEM).forEach((item) => resize.observe(item));
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
        "aria-checked"
      ]
    });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      list.removeEventListener("pointerover", over);
      list.removeEventListener("pointerleave", leave);
      list.removeEventListener("focusin", schedule);
      list.removeEventListener("focusout", schedule);
      document.removeEventListener("keydown", key, true);
      resize.disconnect();
      mutations.disconnect();
      list.removeAttribute("data-list-highlight");
    };
  }, []);

  const travel = box.jump || reduced ? snap : spring.moderate;
  return (
    <motion.span
      ref={self}
      aria-hidden
      data-slot="list-highlight"
      data-danger={box.danger || undefined}
      initial={false}
      style={{ borderRadius: box.radius }}
      animate={{
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        opacity: box.visible ? 1 : 0
      }}
      transition={{ default: travel, opacity: box.visible ? fade.enter : exit.moderate }}
    />
  );
}
