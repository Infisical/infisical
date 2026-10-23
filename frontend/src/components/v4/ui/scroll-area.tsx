"use client";

import * as React from "react";
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";

import { cn } from "../lib/utils";

function ScrollArea({
  className,
  children,
  edgeBehavior = "fade",
  orientation = "vertical",
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
  /** What marks an edge with more content past it: a fade (default), a hairline or nothing. */
  edgeBehavior?: "fade" | "border" | "none";
  orientation?: "vertical" | "horizontal" | "both";
} & { ref?: React.Ref<React.ComponentRef<typeof ScrollAreaPrimitive.Root>> }) {
  return (
    <ScrollAreaPrimitive.Root
      ref={ref}
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        data-scroll-fade={
          edgeBehavior === "none"
            ? undefined
            : { vertical: "y", horizontal: "x", both: "both" }[orientation]
        }
        data-scroll-edge={edgeBehavior === "border" ? "border" : undefined}
        tabIndex={0}
        className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--v4-focus-ring)] focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {orientation !== "horizontal" && <ScrollBar />}
      {orientation !== "vertical" && <ScrollBar orientation="horizontal" />}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}
ScrollArea.displayName = "ScrollArea";

function ScrollBar({
  className,
  orientation = "vertical",
  ref,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      ref={ref}
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-0.5 transition-opacity duration-(--v4-duration-fast) ease-(--v4-ease-fade) select-none data-[orientation=horizontal]:h-2 data-[orientation=horizontal]:flex-col data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2 data-[state=hidden]:opacity-0 data-[state=visible]:opacity-100",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-[calc(var(--v4-radius-control)*var(--corners))] bg-[color:var(--v4-scroll-thumb)] hover:bg-[color:var(--v4-scroll-thumb-hover)]"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}
ScrollBar.displayName = "ScrollBar";

export { ScrollArea, ScrollBar };
