import * as React from "react";

type ScrollAxis = "horizontal" | "vertical";

type ScrollEdges = {
  start: boolean;
  end: boolean;
};

const SCROLL_THRESHOLD = 1;

function useScrollEdges<T extends HTMLElement>(
  axis: ScrollAxis,
  forwardedRef?: React.ForwardedRef<T>
) {
  const viewportRef = React.useRef<T | null>(null);
  const [scrollEdges, setScrollEdges] = React.useState<ScrollEdges>({
    start: false,
    end: false
  });

  const updateScrollEdges = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const scrollOffset = axis === "vertical" ? viewport.scrollTop : Math.abs(viewport.scrollLeft);
    const viewportSize = axis === "vertical" ? viewport.clientHeight : viewport.clientWidth;
    const scrollSize = axis === "vertical" ? viewport.scrollHeight : viewport.scrollWidth;
    const nextScrollEdges = {
      start: scrollOffset > SCROLL_THRESHOLD,
      end: scrollOffset + viewportSize < scrollSize - SCROLL_THRESHOLD
    };

    setScrollEdges((current) =>
      current.start === nextScrollEdges.start && current.end === nextScrollEdges.end
        ? current
        : nextScrollEdges
    );
  }, [axis]);

  const setViewportRef = React.useCallback(
    (node: T | null) => {
      viewportRef.current = node;

      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        Object.assign(forwardedRef, { current: node });
      }
    },
    [forwardedRef]
  );

  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    updateScrollEdges();
    viewport.addEventListener("scroll", updateScrollEdges, { passive: true });

    const resizeObserver = new ResizeObserver(updateScrollEdges);
    const observeViewportAndChildren = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(viewport);
      Array.from(viewport.children).forEach((child) => resizeObserver.observe(child));
    };

    observeViewportAndChildren();

    const mutationObserver = new MutationObserver(() => {
      observeViewportAndChildren();
      updateScrollEdges();
    });
    mutationObserver.observe(viewport, { childList: true });

    return () => {
      viewport.removeEventListener("scroll", updateScrollEdges);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [updateScrollEdges]);

  return { scrollEdges, setViewportRef, viewportRef };
}

export { type ScrollAxis, type ScrollEdges, useScrollEdges };
