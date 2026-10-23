"use client";

import * as React from "react";
import { Popover as PopoverPrimitive, Slot } from "radix-ui";

import { useV4PortalContainer } from "@app/components/v4/scope";

import { useOwnedEscape } from "../lib/use-owned-escape";
import { cn } from "../lib/utils";

import menu from "./menu.module.css";

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ref, ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger ref={ref} data-slot="popover-trigger" {...props} />;
}
PopoverTrigger.displayName = "PopoverTrigger";

function PopoverContent({
  className,
  collisionPadding = 8,
  align = "center",
  sideOffset = 4,
  surface = "card",
  onEscapeKeyDown,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
  surface?: "card" | "menu";
} & { ref?: React.Ref<React.ComponentRef<typeof PopoverPrimitive.Content>> }) {
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
        data-scroll-fade="y"
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
PopoverContent.displayName = "PopoverContent";

function PopoverAnchor({
  asChild,
  virtualRef,
  ref,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
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
}
PopoverAnchor.displayName = "PopoverAnchor";

function PopoverHeader({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5", className)}
      {...props}
    />
  );
}
PopoverHeader.displayName = "PopoverHeader";

function PopoverTitle({
  className,
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"h2"> & { ref?: React.Ref<HTMLHeadingElement> }) {
  return (
    <h2 ref={ref} data-slot="popover-title" className={cn("", className)} {...props}>
      {children}
    </h2>
  );
}
PopoverTitle.displayName = "PopoverTitle";

function PopoverDescription({ className, ref, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      ref={ref}
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}
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
