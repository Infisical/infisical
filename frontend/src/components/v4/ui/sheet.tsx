import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";

import { useV4PortalContainer } from "@app/components/v4/scope";
import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";

import { splitOverlaySections } from "../lib/overlay-sections";
import { useOwnedEscape } from "../lib/use-owned-escape";
import { cn } from "../lib/utils";

import overlay from "./overlay.module.css";

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ref, ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger ref={ref} data-slot="sheet-trigger" {...props} />;
}
SheetTrigger.displayName = "SheetTrigger";

function SheetClose({ ref, ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close ref={ref} data-slot="sheet-close" {...props} />;
}
SheetClose.displayName = "SheetClose";

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return (
    <SheetPrimitive.Portal container={useV4PortalContainer()} data-slot="sheet-portal" {...props} />
  );
}

function SheetOverlay({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      ref={ref}
      data-slot="sheet-overlay"
      className={cn("z-50", overlay.scrim, overlay.scrimSlow, className)}
      {...props}
    />
  );
}
SheetOverlay.displayName = "SheetOverlay";

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  onEscapeKeyDown,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
} & { ref?: React.Ref<React.ComponentRef<typeof SheetPrimitive.Content>> }) {
  const escape = useOwnedEscape(ref, onEscapeKeyDown);
  const sections = splitOverlaySections(children, {
    header: SheetHeader,
    subheader: SheetSubheader,
    body: SheetBody,
    footer: SheetFooter
  });
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={escape.ref}
        data-slot="sheet-content"
        data-scroll-fade={sections ? undefined : "y"}
        data-sections={sections ? "" : undefined}
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
          overlay.pop,
          overlay.sheet,
          className
        )}
        {...props}
        onEscapeKeyDown={escape.onEscapeKeyDown}
      >
        {sections ? (
          <>
            {sections.pinned}
            {sections.scroll.length > 0 && (
              <div data-slot="sheet-scroll" data-scroll-fade="y">
                {sections.scroll}
              </div>
            )}
            {sections.footer}
          </>
        ) : (
          children
        )}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button variant="ghost" className={overlay.close} size="icon-sm">
              <Icon name="x" />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}
SheetContent.displayName = "SheetContent";

function SheetHeader({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  );
}
SheetHeader.displayName = "SheetHeader";

function SheetSubheader({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} data-slot="sheet-subheader" className={cn(className)} {...props} />;
}
SheetSubheader.displayName = "SheetSubheader";

function SheetBody({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} data-slot="sheet-body" className={cn(className)} {...props} />;
}
SheetBody.displayName = "SheetBody";

function SheetFooter({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}
SheetFooter.displayName = "SheetFooter";

function SheetTitle({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      ref={ref}
      data-slot="sheet-title"
      className={cn("text-foreground", className)}
      {...props}
    />
  );
}
SheetTitle.displayName = "SheetTitle";

function SheetDescription({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      ref={ref}
      data-slot="sheet-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}
SheetDescription.displayName = "SheetDescription";

export {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetSubheader,
  SheetTitle,
  SheetTrigger
};
