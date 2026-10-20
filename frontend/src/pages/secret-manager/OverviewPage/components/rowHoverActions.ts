import { FocusEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";

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
    onMouseEnter: (e: MouseEvent<HTMLElement>) => void;
    onMouseMove: (e: MouseEvent<HTMLElement>) => void;
    onMouseLeave: (e: MouseEvent<HTMLElement>) => void;
    onFocus: (e: FocusEvent<HTMLElement>) => void;
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
  // The row element itself, captured from whichever of its own events last fired. The hook hands
  // out props rather than a ref, so this is the only way to ask the DOM about the row without
  // making every row component thread one through.
  const rowElementRef = useRef<HTMLElement | null>(null);
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
      // Coming back from a popover or sheet this row rendered, the pointer crosses out of a node
      // that is not a DOM descendant and into the row, and React sends no fresh enter because the
      // two are neighbours in its own tree. The row is genuinely hovered and will never be told
      // so. At release time the DOM still knows, so ask it rather than wait for an event that is
      // not coming.
      if (rowElementRef.current?.matches(":hover")) {
        setIsHovered(true);
        return;
      }

      isActionBarMountedRef.current = false;
      setShouldRenderActions(false);
    }, ACTION_BAR_TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [isRowActive, hasHoverPointer]);

  const rowHoverProps = useMemo(
    () => ({
      tabIndex: needsRowTabStop ? 0 : undefined,
      // Same portal trap as the focus handler below. React's synthetic mouse-enter is dispatched
      // along the React tree, so a popover or sheet this row renders counts as the row for enter
      // purposes even though it is mounted on <body>. Opening one under a pointer that is nowhere
      // near the row would otherwise mark the row hovered, and because the matching leave belongs
      // to a node that is not a DOM descendant the row never sees it: the bar stays mounted for
      // the life of the page on a row the user is not on.
      onMouseEnter: (e: MouseEvent<HTMLElement>) => {
        rowElementRef.current = e.currentTarget;
        if (!e.currentTarget.contains(e.target as Node)) return;
        setIsHovered(true);
      },
      // The enter that would announce the pointer coming back from a popover or sheet this row
      // rendered never arrives, because React treats the two as neighbours in its own tree. The
      // release path below re-derives once, but only at the moment the hold drops, which for a
      // popover that takes focus is while the pointer is still inside it. The first move over the
      // row is the one signal that always arrives, whenever the pointer actually returns.
      onMouseMove: (e: MouseEvent<HTMLElement>) => {
        rowElementRef.current = e.currentTarget;
        if (isHovered || !e.currentTarget.contains(e.target as Node)) return;
        setIsHovered(true);
      },
      onMouseLeave: (e: MouseEvent<HTMLElement>) => {
        rowElementRef.current = e.currentTarget;
        setIsHovered(false);
      },
      // React's synthetic focus bubbles through portals, so focus landing in a popover this row
      // renders would otherwise mark the row focused. That node is not a DOM descendant, so when
      // the popover closes without handing focus back the row never sees a matching onBlur and
      // stays active for the life of the page, holding its bar mounted. The popover-open flags
      // each row keeps are what hold the bar while a popover is genuinely in use.
      onFocus: (e: FocusEvent<HTMLElement>) => {
        rowElementRef.current = e.currentTarget;
        if (!e.currentTarget.contains(e.target)) return;
        setIsFocusWithin(true);
      },
      onBlur: (e: FocusEvent<HTMLElement>) => {
        // focusout bubbles, so only drop the row once focus has left the row entirely.
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setIsFocusWithin(false);
      }
    }),
    [needsRowTabStop, isHovered]
  );

  return {
    shouldRenderActions,
    groupClassName: isGroupEnabled ? "group" : "",
    rowHoverProps
  };
};
