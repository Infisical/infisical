import * as React from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { cn } from "../../utils";
import { useScrollEdges } from "../../utils/useScrollEdges";
import { IconButton } from "../IconButton";

import "../../utils/ScrollEdgeFade.css";
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
      style,
      ...props
    },
    forwardedRef
  ) => {
    const { scrollEdges, setViewportRef, viewportRef } = useScrollEdges<HTMLDivElement>(
      "vertical",
      forwardedRef
    );

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
        data-scrollable-top={scrollEdges.start}
        data-scrollable-bottom={scrollEdges.end}
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
          data-scroll-edge-axis="vertical"
          data-scrollable-start={scrollEdges.start}
          data-scrollable-end={scrollEdges.end}
          data-scrollable-top={scrollEdges.start}
          data-scrollable-bottom={scrollEdges.end}
          className={cn(
            "scrollable-content-viewport min-h-0 overflow-x-hidden overflow-y-auto outline-none focus-visible:ring-1 focus-visible:ring-ring",
            edgeBehavior === "fade" && "scroll-edge-fade",
            outline && "rounded-md",
            className
          )}
          style={scrollableStyle}
          {...props}
        >
          {edgeBehavior === "border" && (
            <>
              <div aria-hidden data-edge="top" className="scrollable-content-edge" />
              <div aria-hidden data-edge="bottom" className="scrollable-content-edge" />
            </>
          )}
          <div data-slot="scrollable-content-content" className={contentClassName}>
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
              isDisabled={!scrollEdges.start}
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
              isDisabled={!scrollEdges.end}
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
