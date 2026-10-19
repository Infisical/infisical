"use client";

import * as React from "react";
import { cn } from "cn";
import { Popover as PopoverPrimitive, Slot } from "radix-ui";

import { useV4PortalContainer } from "@app/components/v4/scope";

import { useOwnedEscape } from "../lib/use-owned-escape";

import menu from "./menu.module.css";

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

const PopoverTrigger = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>
>(({ ...props }, ref) => {
  return <PopoverPrimitive.Trigger ref={ref} data-slot="popover-trigger" {...props} />;
});
PopoverTrigger.displayName = "PopoverTrigger";

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & { surface?: "card" | "menu" }
>(
  (
    {
      className,
      collisionPadding = 8,
      align = "center",
      sideOffset = 4,
      surface = "card",
      onEscapeKeyDown,
      ...props
    },
    ref
  ) => {
    const escape = useOwnedEscape(ref, onEscapeKeyDown);
    return (
      <PopoverPrimitive.Portal container={useV4PortalContainer()}>
        <PopoverPrimitive.Content
          ref={escape.ref}
          data-slot="popover-content"
          collisionPadding={collisionPadding}
          align={align}
          sideOffset={sideOffset}
          data-surface={surface}
          className={cn(
            "z-50",
            menu.surface,
            surface === "menu" ? menu.panel : menu.card,
            menu.motion,
            className
          )}
          {...props}
          onEscapeKeyDown={escape.onEscapeKeyDown}
        />
      </PopoverPrimitive.Portal>
    );
  }
);
PopoverContent.displayName = "PopoverContent";

const PopoverAnchor = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Anchor>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Anchor>
>(({ asChild, virtualRef, ...props }, ref) => {
  const node = React.useRef<HTMLDivElement | null>(null);
  const attach = React.useCallback(
    (element: HTMLDivElement | null) => {
      node.current = element;
      if (typeof ref === "function") ref(element);
      else if (ref) {
        // eslint-disable-next-line no-param-reassign -- React attaches forwarded object refs by mutation.
        ref.current = element;
      }
    },
    [ref]
  );
  if (virtualRef)
    return (
      <PopoverPrimitive.Anchor
        ref={ref}
        data-slot="popover-anchor"
        virtualRef={virtualRef}
        hidden
        {...props}
      />
    );
  // Radix registers a real anchor only when its node attaches, and its trigger re-mounts without
  // the anchor wrapper once a custom anchor exists, so the popper measures through a virtual ref.
  const Comp = asChild ? Slot.Root : "div";
  return (
    <>
      <Comp ref={attach} data-slot="popover-anchor" {...props} />
      <PopoverPrimitive.Anchor virtualRef={node} hidden />
    </>
  );
});
PopoverAnchor.displayName = "PopoverAnchor";

const PopoverHeader = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5", className)}
      {...props}
    />
  );
});
PopoverHeader.displayName = "PopoverHeader";

const PopoverTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<"h2">>(
  ({ className, children, ...props }, ref) => (
    <h2 ref={ref} data-slot="popover-title" className={cn("", className)} {...props}>
      {children}
    </h2>
  )
);
PopoverTitle.displayName = "PopoverTitle";

const PopoverDescription = React.forwardRef<
  React.ComponentRef<"p">,
  React.ComponentPropsWithoutRef<"p">
>(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
});
PopoverDescription.displayName = "PopoverDescription";

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
};
