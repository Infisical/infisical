import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { useV4PortalContainer } from "@app/components/v4/scope";
import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";

import { splitOverlaySections } from "../lib/overlay-sections";
import { useOwnedEscape } from "../lib/use-owned-escape";
import { cn } from "../lib/utils";

import overlay from "./overlay.module.css";

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ref, ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger ref={ref} data-slot="dialog-trigger" {...props} />;
}
DialogTrigger.displayName = "DialogTrigger";

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return (
    <DialogPrimitive.Portal
      container={useV4PortalContainer()}
      data-slot="dialog-portal"
      {...props}
    />
  );
}

function DialogClose({ ref, ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close ref={ref} data-slot="dialog-close" {...props} />;
}
DialogClose.displayName = "DialogClose";

function DialogOverlay({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      data-slot="dialog-overlay"
      className={cn("isolate z-50", overlay.scrim, className)}
      {...props}
    />
  );
}
DialogOverlay.displayName = "DialogOverlay";

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onEscapeKeyDown,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
} & { ref?: React.Ref<React.ComponentRef<typeof DialogPrimitive.Content>> }) {
  const escape = useOwnedEscape(ref, onEscapeKeyDown);
  const sections = splitOverlaySections(children, {
    header: DialogHeader,
    subheader: DialogSubheader,
    footer: DialogFooter
  });
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={escape.ref}
        data-slot="dialog-content"
        data-scroll-fade={sections ? undefined : "y"}
        data-sections={sections ? "" : undefined}
        className={cn("z-50", overlay.pop, overlay.dialog, className)}
        {...props}
        onEscapeKeyDown={escape.onEscapeKeyDown}
      >
        {sections ? (
          <>
            {sections.pinned.length > 0 && <div data-slot="dialog-head">{sections.pinned}</div>}
            {sections.scroll.length > 0 && (
              <div data-slot="dialog-scroll" data-scroll-fade="y">
                {sections.scroll}
              </div>
            )}
            {sections.footer}
          </>
        ) : (
          children
        )}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button variant="ghost" className={overlay.close} size="icon-sm">
              <Icon name="x" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}
DialogContent.displayName = "DialogContent";

function DialogHeader({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}
DialogHeader.displayName = "DialogHeader";

function DialogSubheader({ className, ref, ...props }: React.ComponentProps<"div">) {
  return <div ref={ref} data-slot="dialog-subheader" className={cn(className)} {...props} />;
}
DialogSubheader.displayName = "DialogSubheader";

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  showCloseButton?: boolean;
} & { ref?: React.Ref<React.ComponentRef<"div">> }) {
  return (
    <div
      ref={ref}
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse sm:flex-row sm:justify-end", className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}
DialogFooter.displayName = "DialogFooter";

function DialogTitle({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      data-slot="dialog-title"
      className={cn("", className)}
      {...props}
    />
  );
}
DialogTitle.displayName = "DialogTitle";

function DialogDescription({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      data-slot="dialog-description"
      className={cn(
        "text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  );
}
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogSubheader,
  DialogTitle,
  DialogTrigger
};
