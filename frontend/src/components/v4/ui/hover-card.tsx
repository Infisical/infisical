"use client";

import * as React from "react";
import { HoverCard as HoverCardPrimitive } from "radix-ui";

import { useV4CollisionBoundary, useV4PortalContainer } from "@app/components/v4/scope";

import { FrameScope } from "../lib/frame-context";
import { cn } from "../lib/utils";

import menu from "./menu.module.css";

function HoverCard({ ...props }: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />;
}

function HoverCardTrigger({
  ref,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return <HoverCardPrimitive.Trigger ref={ref} data-slot="hover-card-trigger" {...props} />;
}
HoverCardTrigger.displayName = "HoverCardTrigger";

function HoverCardContent({
  className,
  collisionPadding = 8,
  align = "center",
  sideOffset = 4,
  width = "default",
  ref,
  children,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content> & {
  /** default is size-popover; sm and md are size-sheet-sm and size-sheet-md, for a table or raw payload; content fits its content up to size-dialog-wide. Every width shrinks to the space available. */
  width?: "default" | "sm" | "md" | "content";
}) {
  return (
    <HoverCardPrimitive.Portal container={useV4PortalContainer()} data-slot="hover-card-portal">
      <HoverCardPrimitive.Content
        ref={ref}
        data-slot="hover-card-content"
        data-width={width}
        collisionPadding={collisionPadding}
        collisionBoundary={useV4CollisionBoundary()}
        align={align}
        sideOffset={sideOffset}
        className={cn("z-50", menu.surface, menu.card, menu.motion, className)}
        {...props}
      >
        <FrameScope framed={false}>{children}</FrameScope>
      </HoverCardPrimitive.Content>
    </HoverCardPrimitive.Portal>
  );
}
HoverCardContent.displayName = "HoverCardContent";

export { HoverCard, HoverCardContent, HoverCardTrigger };
