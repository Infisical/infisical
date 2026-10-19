import * as React from "react";
import { cn } from "cn";
import { Tooltip as TooltipPrimitive } from "radix-ui";

import { useV4PortalContainer } from "@app/components/v4/scope";

import { Kbd } from "./kbd";

import menu from "./menu.module.css";

function TooltipProvider({
  delayDuration = 200,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip({
  content,
  shortcut,
  side = "top",
  align = "center",
  wrap = false,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root> & {
  content?: React.ReactNode;
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  wrap?: boolean;
}) {
  return (
    <TooltipPrimitive.Root data-slot="tooltip" {...props}>
      {content ? (
        <>
          <TooltipTrigger asChild>{children}</TooltipTrigger>
          <TooltipContent
            side={side}
            align={align}
            className={wrap ? "whitespace-normal" : "whitespace-nowrap"}
          >
            {content}
            {shortcut && <Kbd>{shortcut}</Kbd>}
          </TooltipContent>
        </>
      ) : (
        children
      )}
    </TooltipPrimitive.Root>
  );
}

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ ...props }, ref) => {
  return <TooltipPrimitive.Trigger ref={ref} data-slot="tooltip-trigger" {...props} />;
});
TooltipTrigger.displayName = "TooltipTrigger";

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, collisionPadding = 8, sideOffset = 0, children, ...props }, ref) => {
  return (
    <TooltipPrimitive.Portal container={useV4PortalContainer()}>
      <TooltipPrimitive.Content
        ref={ref}
        data-slot="tooltip-content"
        collisionPadding={collisionPadding}
        sideOffset={sideOffset}
        className={cn("z-50", menu.tooltip, menu.motion, className)}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow width={10} height={5} className={menu.tooltipArrow} />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = "TooltipContent";

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
