import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

import { exit, fade, motionMs, snap, spring } from "../lib/motion";
import { cn } from "../lib/utils";

import styles from "./text.module.css";

// A closed region leaves the parent's gap behind until it unmounts; the collapse eats that gap
// with a matching negative margin so nothing snaps when `hidden` finally removes it.
const stackGap = (node: HTMLElement | null) => {
  const parent = node?.parentElement;
  if (!node?.previousElementSibling || !parent) return 0;
  const layout = getComputedStyle(parent);
  const vertical =
    layout.display.includes("grid") ||
    (layout.display.includes("flex") && layout.flexDirection.startsWith("column"));
  return vertical ? parseFloat(layout.rowGap) || 0 : 0;
};

export const AnimatedCollapse = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> & { open: boolean; lazy?: boolean }
>(({ open, lazy = false, children, className, style, ...props }, ref) => {
  const own = React.useRef<HTMLDivElement | null>(null);
  const [gap, setGap] = React.useState(0);
  const [present, setPresent] = React.useState(open);
  const [mounted, setMounted] = React.useState(!lazy || open);
  const [expanded, setExpanded] = React.useState(open);
  React.useEffect(() => {
    setGap(stackGap(own.current));
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (open) {
      setMounted(true);
      setPresent(true);
      if (reducedMotion) {
        setExpanded(true);
        return;
      }
      const frame = requestAnimationFrame(() => setExpanded(true));
      return () => cancelAnimationFrame(frame);
    }
    setExpanded(false);
    if (reducedMotion) {
      setPresent(false);
      return;
    }
    const timer = window.setTimeout(() => setPresent(false), motionMs.exit.moderate);
    return () => window.clearTimeout(timer);
  }, [open]);
  const reduced = useReducedMotion();
  const [settled, setSettled] = React.useState(open);
  React.useEffect(() => {
    if (!expanded) setSettled(false);
  }, [expanded]);
  const travel = reduced ? snap : expanded ? spring.moderate : exit.moderate;
  return (
    <motion.div
      ref={(node) => {
        own.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      data-slot="animated-collapse"
      data-open={expanded || undefined}
      className={cn(styles.collapse, className)}
      hidden={!present && !open}
      aria-hidden={!open || undefined}
      {...(!open ? { inert: true } : {})}
      initial={false}
      animate={{ height: expanded ? "auto" : 0, marginBlockStart: expanded ? 0 : -gap }}
      transition={travel}
      onAnimationComplete={() => {
        if (expanded) setSettled(true);
      }}
      style={{ ...style, overflow: settled ? "visible" : "hidden" }}
      {...(props as Omit<
        typeof props,
        "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart"
      >)}
    >
      <motion.div
        className={styles.collapseInner}
        initial={false}
        animate={{ opacity: expanded ? 1 : 0 }}
        transition={expanded ? fade.enter : exit.fast}
      >
        {(!lazy || mounted || open) && children}
      </motion.div>
    </motion.div>
  );
});
AnimatedCollapse.displayName = "AnimatedCollapse";
