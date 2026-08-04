import * as React from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { cn } from "../../utils";
import { IconButton } from "../IconButton";

import "./ScrollableContent.css";

type ScrollableContentStyle = React.CSSProperties & {
  "--scrollable-content-max-height"?: string;
};

type ScrollableContentSize = "sm" | "md" | "lg";

type ScrollableContentProps = Omit<React.ComponentPropsWithoutRef<"div">, "aria-label"> & {
  "aria-label": string;
  maxHeight?: React.CSSProperties["maxHeight"];
  size?: ScrollableContentSize;
  edgeBehavior?: "none" | "fade" | "border";
  outline?: boolean;
  showScrollers?: boolean;
  containerClassName?: string;
  contentClassName?: string;
};

const ScrollableContent = React.forwardRef<HTMLDivElement, ScrollableContentProps>(
  (
    {
      children,
      className,
      containerClassName,
      contentClassName,
      edgeBehavior = "none",
      maxHeight,
      outline = true,
      showScrollers = false,
      size = "lg",
      onScroll,
      style,
      ...props
    },
    forwardedRef
  ) => {
    const viewportRef = React.useRef<HTMLDivElement | null>(null);
    const contentRef = React.useRef<HTMLDivElement | null>(null);
    const [scrollability, setScrollability] = React.useState({
      top: false,
      bottom: false
    });

    const updateScrollability = React.useCallback(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const nextScrollability = {
        top: viewport.scrollTop > 1,
        bottom: viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1
      };

      setScrollability((current) =>
        current.top === nextScrollability.top && current.bottom === nextScrollability.bottom
          ? current
          : nextScrollability
      );
    }, []);

    const setViewportRef = React.useCallback(
      (node: HTMLDivElement | null) => {
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
      const content = contentRef.current;
      if (!viewport || !content) return undefined;

      updateScrollability();

      const resizeObserver = new ResizeObserver(updateScrollability);
      resizeObserver.observe(viewport);
      resizeObserver.observe(content);

      return () => resizeObserver.disconnect();
    }, [updateScrollability]);

    const scrollableStyle: ScrollableContentStyle = {
      ...style,
      ...(maxHeight !== undefined
        ? {
            "--scrollable-content-max-height":
              typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight
          }
        : {})
    };

    const scrollByViewport = (direction: "up" | "down") => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      viewport.scrollBy({
        top: viewport.clientHeight * (direction === "up" ? -1 : 1),
        behavior: prefersReducedMotion ? "auto" : "smooth"
      });
    };

    return (
      <div
        data-slot="scrollable-content"
        data-scrollable-top={scrollability.top}
        data-scrollable-bottom={scrollability.bottom}
        className={cn(
          "relative min-w-0",
          outline && "rounded-md outline-1 outline-offset-4 outline-accent/60 outline-solid",
          containerClassName
        )}
      >
        <div
          ref={setViewportRef}
          role="region"
          // Scroll regions must be keyboard reachable, including when their children are informational.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          data-slot="scrollable-content-viewport"
          data-size={size}
          data-edge-behavior={edgeBehavior}
          data-scrollable-top={scrollability.top}
          data-scrollable-bottom={scrollability.bottom}
          className={cn(
            "scrollable-content-viewport min-h-0 overflow-x-hidden overflow-y-auto outline-none focus-visible:ring-1 focus-visible:ring-ring",
            outline && "rounded-md",
            className
          )}
          style={scrollableStyle}
          onScroll={(event) => {
            updateScrollability();
            onScroll?.(event);
          }}
          {...props}
        >
          {edgeBehavior === "border" && (
            <>
              <div aria-hidden data-edge="top" className="scrollable-content-edge" />
              <div aria-hidden data-edge="bottom" className="scrollable-content-edge" />
            </>
          )}
          <div ref={contentRef} data-slot="scrollable-content-content" className={contentClassName}>
            {children}
          </div>
        </div>
        {showScrollers && (
          <>
            <IconButton
              type="button"
              size="xs"
              variant="neutral"
              aria-label="Scroll up"
              data-scroll-direction="up"
              isDisabled={!scrollability.top}
              className="scrollable-content-scroller shadow-md"
              onClick={() => scrollByViewport("up")}
            >
              <ChevronUpIcon />
            </IconButton>
            <IconButton
              type="button"
              size="xs"
              variant="neutral"
              aria-label="Scroll down"
              data-scroll-direction="down"
              isDisabled={!scrollability.bottom}
              className="scrollable-content-scroller shadow-md"
              onClick={() => scrollByViewport("down")}
            >
              <ChevronDownIcon />
            </IconButton>
          </>
        )}
      </div>
    );
  }
);

ScrollableContent.displayName = "ScrollableContent";

export { ScrollableContent, type ScrollableContentProps, type ScrollableContentSize };
