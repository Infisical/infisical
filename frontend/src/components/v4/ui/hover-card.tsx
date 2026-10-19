"use client";

import * as React from "react";
import { cn } from "cn";
import { HoverCard as HoverCardPrimitive } from "radix-ui";

import { useV4PortalContainer } from "@app/components/v4/scope";

import menu from "./menu.module.css";

function HoverCard({ ...props }: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />;
}

const HoverCardTrigger = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Trigger>
>(({ ...props }, ref) => {
  return <HoverCardPrimitive.Trigger ref={ref} data-slot="hover-card-trigger" {...props} />;
});
HoverCardTrigger.displayName = "HoverCardTrigger";

const HoverCardContent = React.forwardRef<
  React.ComponentRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, collisionPadding = 8, align = "center", sideOffset = 4, ...props }, ref) => {
  return (
    <HoverCardPrimitive.Portal container={useV4PortalContainer()} data-slot="hover-card-portal">
      <HoverCardPrimitive.Content
        ref={ref}
        data-slot="hover-card-content"
        collisionPadding={collisionPadding}
        align={align}
        sideOffset={sideOffset}
        className={cn("z-50", menu.surface, menu.card, menu.motion, className)}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
});
HoverCardContent.displayName = "HoverCardContent";

export { HoverCard, HoverCardContent, HoverCardTrigger };
