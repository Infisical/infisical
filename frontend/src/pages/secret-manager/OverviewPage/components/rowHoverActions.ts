import { FocusEvent, useEffect, useMemo, useRef, useState } from "react";

/**
 * Matches the `transition-all duration-300` the action bars fade out with, so the bar stays in the
 * DOM long enough to finish fading before it is removed.
 */
const ACTION_BAR_TRANSITION_MS = 300;

/**
 * The action bars' own styles are written so that a device without a hovering pointer never
 * depends on hover: every rule that hides them, `opacity-0`, `pointer-events-none`, the buttons'
 * `w-0`, sits behind `[@media(hover:hover)]`, leaving the bar visible by default everywhere else.
 * Mounting on `mouseenter` would throw that away, because viewing or scrolling a table on a phone
 * fires neither hover nor focus, and the controls would simply not exist. So where there is no
 * hovering pointer the bar is mounted unconditionally and the CSS decides, exactly as before.
 */
const HOVER_POINTER_QUERY = "(hover: hover)";

const getHoverPointerQuery = () =>
  typeof window === "undefined" || typeof window.matchMedia !== "function"
    ? null
    : window.matchMedia(HOVER_POINTER_QUERY);

const useHasHoverPointer = () => {
  // Assume a hovering pointer when the query is unavailable: that is the gated behaviour, which
  // degrades to "reachable by pointer and keyboard" rather than to "reachable by nothing".
  const [hasHoverPointer, setHasHoverPointer] = useState(
    () => getHoverPointerQuery()?.matches ?? true
  );

  useEffect(() => {
    const query = getHoverPointerQuery();
    if (!query) return undefined;

    // Re-read on mount as well as on change: a device can gain or lose a pointer, and the first
    // render may have run before the query was available.
    setHasHoverPointer(query.matches);

    const onChange = (event: MediaQueryListEvent) => setHasHoverPointer(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return hasHoverPointer;
};

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
  // "Ever mounted" gates the fade-out timer; "still mounted" gates the one-frame withhold below.
  const isActionBarMountedRef = useRef(false);
  const hasHoverPointer = useHasHoverPointer();

  // Focus is tracked separately from hover so that moving the pointer off a row does not yank a
  // focused button out from under the keyboard.
  const isRowActive = isHovered || isFocusWithin;

  useEffect(() => {
    // Without a hovering pointer the bar is always mounted and always carries `group`, which is
    // the DOM the CSS was written against; nothing below applies.
    if (!hasHoverPointer) {
      hasRenderedActionsRef.current = true;
      isActionBarMountedRef.current = true;
      setShouldRenderActions(true);
      setIsGroupEnabled(true);
      return undefined;
    }

    if (isRowActive) {
      hasRenderedActionsRef.current = true;
      const wasAlreadyMounted = isActionBarMountedRef.current;
      isActionBarMountedRef.current = true;
      setShouldRenderActions(true);

      // The withhold exists so a freshly inserted bar has a hidden state to interpolate from. A
      // bar that never unmounted already has one, so re-entering during its fade-out restores
      // `group` at once instead of letting it keep fading for two more frames.
      if (wasAlreadyMounted) {
        setIsGroupEnabled(true);
        return undefined;
      }

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

    const timeout = setTimeout(() => {
      isActionBarMountedRef.current = false;
      setShouldRenderActions(false);
    }, ACTION_BAR_TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [isRowActive, hasHoverPointer]);

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
