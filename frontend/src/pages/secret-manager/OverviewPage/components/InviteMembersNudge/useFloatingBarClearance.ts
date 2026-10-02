import { useLayoutEffect, useState } from "react";

// Floating bars that share the bottom edge of the secret overview page. The selection action bar
// portals to document.body and the batch commit bar is a fixed sibling, so neither can be wrapped
// by a container ref; they are measured through their data-slot instead.
const FLOATING_BAR_SELECTOR = [
  '[data-slot="selected-action-bar"][data-state="open"]',
  '[data-slot="batch-commit-bar"]'
].join(", ");

const DEFAULT_BOTTOM_PX = 16;
const GAP_PX = 16;

// The selection bar animates in over 200ms with a translate, so a measurement taken on the same
// frame it opens is a few pixels low; re-measure once the transition has settled.
const SETTLE_DELAY_MS = 250;

const measureClearance = () => {
  let highestTop = Infinity;
  document.querySelectorAll<HTMLElement>(FLOATING_BAR_SELECTOR).forEach((bar) => {
    const { top, height } = bar.getBoundingClientRect();
    if (height > 0) highestTop = Math.min(highestTop, top);
  });
  if (highestTop === Infinity) return DEFAULT_BOTTOM_PX;
  return Math.round(window.innerHeight - highestTop + GAP_PX);
};

// Distance in px from the viewport bottom that clears whichever floating bar is visible, or the
// default margin when `isActive` is false.
export const useFloatingBarClearance = (isActive: boolean) => {
  const [bottom, setBottom] = useState(DEFAULT_BOTTOM_PX);

  useLayoutEffect(() => {
    if (!isActive) {
      setBottom(DEFAULT_BOTTOM_PX);
      return undefined;
    }

    const update = () => setBottom(measureClearance());
    update();

    const resizeObserver = new ResizeObserver(update);
    document.querySelectorAll(FLOATING_BAR_SELECTOR).forEach((bar) => resizeObserver.observe(bar));
    window.addEventListener("resize", update);
    const settleTimeout = setTimeout(update, SETTLE_DELAY_MS);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", update);
      clearTimeout(settleTimeout);
    };
  }, [isActive]);

  return bottom;
};
