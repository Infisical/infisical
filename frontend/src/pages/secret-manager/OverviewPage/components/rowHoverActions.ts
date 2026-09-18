import { FocusEvent, useEffect, useMemo, useRef, useState } from "react";

/**
 * Matches the `transition-all duration-300` the action bars fade out with, so the bar stays in the
 * DOM long enough to finish fading before it is removed.
 */
const ACTION_BAR_TRANSITION_MS = 300;

type TRowHoverActions = {
  /**
   * Render the row's hover action bar. False while the row is idle, which keeps the bar's nodes out
   * of the document entirely instead of parking them behind `opacity-0`.
   */
  shouldRenderActions: boolean;
  /**
   * The `group` marker for the row element. It is withheld for one painted frame after the action
   * bar mounts: a freshly inserted element that already matches `group-hover:*` has no previous
   * computed style to interpolate from, so the reveal would pop instead of fade. Applying `group`
   * a frame later gives the browser the hidden state first and the transition runs as before.
   *
   * Action bars key their reveal off `group-focus-within:*` as well as `group-hover:*`, so a bar
   * mounted by keyboard focus fades in the same way one mounted by the pointer does, and a bar
   * holding focus stays visible when the pointer wanders off the row.
   */
  groupClassName: string;
  /** Spread onto the row element that carries `groupClassName`. */
  rowHoverProps: {
    tabIndex?: number;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: (e: FocusEvent<HTMLElement>) => void;
  };
};

type TRowHoverActionsOptions = {
  /**
   * Whether the row element should be a tab stop of its own.
   *
   * `onFocus` can only mount the action bar for a row that is able to receive focus. A row whose
   * cells hold nothing focusable, such as a folder row or a single-environment resource row that
   * is just a name and a few badges, never fires it, which would leave its actions reachable by
   * pointer and by nothing else. Rows that already contain a focusable control bootstrap the bar
   * through that control, so they pass `false` rather than gain a second tab stop in front of it.
   *
   * `tabIndex` does not change the implicit `row` role of a `<tr>`, so a focusable row is still
   * announced as a row.
   */
  needsRowTabStop?: boolean;
};

export const useRowHoverActions = ({
  needsRowTabStop = true
}: TRowHoverActionsOptions = {}): TRowHoverActions => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [shouldRenderActions, setShouldRenderActions] = useState(false);
  const [isGroupEnabled, setIsGroupEnabled] = useState(false);
  const hasRenderedActionsRef = useRef(false);

  // Focus is tracked separately from hover so that moving the pointer off a row does not yank a
  // focused button out from under the keyboard.
  const isRowActive = isHovered || isFocusWithin;

  useEffect(() => {
    if (isRowActive) {
      hasRenderedActionsRef.current = true;
      setShouldRenderActions(true);

      // Two frames: the first paints the bar in its hidden state, the second flips the group on.
      let innerFrame = 0;
      const outerFrame = requestAnimationFrame(() => {
        innerFrame = requestAnimationFrame(() => setIsGroupEnabled(true));
      });

      return () => {
        cancelAnimationFrame(outerFrame);
        cancelAnimationFrame(innerFrame);
      };
    }

    setIsGroupEnabled(false);

    if (!hasRenderedActionsRef.current) return undefined;

    const timeout = setTimeout(() => setShouldRenderActions(false), ACTION_BAR_TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [isRowActive]);

  const rowHoverProps = useMemo(
    () => ({
      tabIndex: needsRowTabStop ? 0 : undefined,
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false),
      onFocus: () => setIsFocusWithin(true),
      onBlur: (e: FocusEvent<HTMLElement>) => {
        // focusout bubbles, so only drop the row once focus has left the row entirely.
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setIsFocusWithin(false);
      }
    }),
    [needsRowTabStop]
  );

  return {
    shouldRenderActions,
    groupClassName: isGroupEnabled ? "group" : "",
    rowHoverProps
  };
};
