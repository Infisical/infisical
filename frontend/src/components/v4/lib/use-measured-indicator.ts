import * as React from "react";

export type IndicatorRect = { x: number; y: number; width: number; height: number };

export type MeasuredIndicatorOptions = {
  /** The positioned container the indicator sits in. */
  listRef: React.RefObject<HTMLElement | null>;
  /** Matches the one item that is currently selected. */
  activeSelector: string;
  /** Matches every item whose size can move the indicator. */
  itemSelector: string;
  /** Overrides the active item's own box, for an indicator that spans more than the item. */
  rect?: (active: HTMLElement, list: HTMLElement) => IndicatorRect;
  /** Runs after each measure, once the active item is known. */
  onMeasure?: (list: HTMLElement, active: HTMLElement | null, context: MeasureContext) => void;
  /** Re-runs the observers when the item set changes. */
  watch?: unknown;
  /** Skips all measuring and observing while false. */
  enabled?: boolean;
};

export type MeasureContext = { reveal: boolean; instant: boolean };

export type IndicatorState = IndicatorRect & { visible: boolean; instant: boolean };

const hidden: IndicatorState = { x: 0, y: 0, width: 0, height: 0, visible: false, instant: true };

/**
 * Measures the selected item and returns the box an indicator should slide to.
 * It snaps on the first measure, on resize and when fonts load, so nothing animates on mount.
 */
export function useMeasuredIndicator({
  listRef,
  activeSelector,
  itemSelector,
  rect,
  onMeasure,
  watch,
  enabled = true
}: MeasuredIndicatorOptions) {
  const [state, setState] = React.useState<IndicatorState>(hidden);
  const instant = React.useRef(true);
  const placed = React.useRef(false);
  const latest = React.useRef({ rect, onMeasure });
  latest.current = { rect, onMeasure };

  const measure = React.useCallback(
    (reveal = false) => {
      const list = listRef.current;
      if (!list) return;
      const active = list.querySelector<HTMLElement>(activeSelector);
      latest.current.onMeasure?.(list, active, { reveal, instant: instant.current });
      if (!active) {
        setState((current) =>
          current.visible ? { ...current, visible: false, instant: false } : current
        );
        return;
      }
      const box = latest.current.rect?.(active, list) ?? {
        x: active.offsetLeft,
        y: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight
      };
      setState({ ...box, visible: true, instant: instant.current });
    },
    [listRef, activeSelector]
  );

  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!enabled || !list) return undefined;
    const snap = () => {
      instant.current = true;
      measure(true);
      instant.current = false;
    };
    if (placed.current) measure(true);
    else snap();
    placed.current = true;
    const observer = new MutationObserver(() => measure(true));
    observer.observe(list, { attributes: true, subtree: true, attributeFilter: ["data-state"] });
    const resize = new ResizeObserver(snap);
    resize.observe(list);
    list.querySelectorAll(itemSelector).forEach((item) => resize.observe(item));
    document.fonts?.addEventListener("loadingdone", snap);
    return () => {
      observer.disconnect();
      resize.disconnect();
      document.fonts?.removeEventListener("loadingdone", snap);
    };
  }, [listRef, itemSelector, measure, watch, enabled]);

  return { state, measure };
}
