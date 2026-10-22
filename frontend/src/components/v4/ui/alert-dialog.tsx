"use client";

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";

import { useV4PortalContainer } from "@app/components/v4/scope";
import { Button } from "@app/components/v4/ui/button";
import { Icon, type IconName } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";

import { splitOverlaySections } from "../lib/overlay-sections";
import { useOwnedEscape } from "../lib/use-owned-escape";
import { cn } from "../lib/utils";

import overlay from "./overlay.module.css";

const ConfirmContext = React.createContext<{ ready: boolean }>({ ready: true });
const ToneContext = React.createContext<{
  tone?: "danger" | "neutral";
  claimMedia: (claimed: boolean) => void;
}>({ claimMedia: () => {} });

function AlertDialog({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

const AlertDialogTrigger = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Trigger>
>(({ ...props }, ref) => {
  return <AlertDialogPrimitive.Trigger ref={ref} data-slot="alert-dialog-trigger" {...props} />;
});
AlertDialogTrigger.displayName = "AlertDialogTrigger";

function AlertDialogPortal({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal
      container={useV4PortalContainer()}
      data-slot="alert-dialog-portal"
      {...props}
    />
  );
}

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  return (
    <AlertDialogPrimitive.Overlay
      ref={ref}
      data-slot="alert-dialog-overlay"
      className={cn("z-50", overlay.scrim, className)}
      {...props}
    />
  );
});
AlertDialogOverlay.displayName = "AlertDialogOverlay";

const AlertDialogContent = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> & {
    size?: "default" | "sm";
    /** danger shows a bad-tone lead tile (trash unless icon or AlertDialogMedia is given); neutral and unset show no automatic tile. */
    tone?: "danger" | "neutral";
    icon?: IconName;
    /** The exact text the person types before the action enables. */
    confirmText?: string;
  }
>(
  (
    { className, size = "default", tone, icon, confirmText, onEscapeKeyDown, children, ...props },
    ref
  ) => {
    const escape = useOwnedEscape(ref, onEscapeKeyDown);
    const [typed, setTyped] = React.useState("");
    const [hasMedia, setHasMedia] = React.useState(false);
    const toneValue = React.useMemo(() => ({ tone, claimMedia: setHasMedia }), [tone]);
    const fieldId = React.useId();
    const field = confirmText !== undefined && (
      <div data-slot="alert-dialog-confirm" className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-sm">
          Type <code className="font-mono">{confirmText}</code> to confirm
        </label>
        <Input
          id={fieldId}
          mono
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>
    );
    const parts = React.Children.toArray(children);
    const footerAt = parts.findIndex(
      (child) => React.isValidElement(child) && child.type === AlertDialogFooter
    );
    if (field) parts.splice(footerAt < 0 ? parts.length : footerAt, 0, field);
    const sections = splitOverlaySections(
      [
        !hasMedia && (icon || tone === "danger") && (
          <AlertDialogMedia key="auto-media" data-auto="">
            <Icon name={icon ?? "trash"} size={20} />
          </AlertDialogMedia>
        ),
        ...parts
      ],
      { header: AlertDialogHeader, footer: AlertDialogFooter }
    );
    return (
      <AlertDialogPortal>
        <AlertDialogOverlay />
        <AlertDialogPrimitive.Content
          ref={escape.ref}
          data-slot="alert-dialog-content"
          data-scroll-fade={sections ? undefined : "y"}
          data-sections={sections ? "" : undefined}
          data-size={size}
          data-tone={tone}
          className={cn(
            "group/alert-dialog-content z-50 data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm",
            overlay.pop,
            overlay.dialog,
            className
          )}
          {...props}
          onOpenAutoFocus={(event) => {
            props.onOpenAutoFocus?.(event);
            if (confirmText !== undefined) setTyped("");
          }}
          onEscapeKeyDown={escape.onEscapeKeyDown}
        >
          <ConfirmContext.Provider
            value={{ ready: confirmText === undefined || typed === confirmText }}
          >
            <ToneContext.Provider value={toneValue}>
              {sections ? (
                <>
                  {sections.scroll.length > 0 && (
                    <div data-slot="alert-dialog-scroll" data-scroll-fade="y">
                      {sections.scroll}
                    </div>
                  )}
                  {sections.footer}
                </>
              ) : (
                <>
                  {!hasMedia && (icon || tone === "danger") && (
                    <AlertDialogMedia data-auto="">
                      <Icon name={icon ?? "trash"} size={20} />
                    </AlertDialogMedia>
                  )}
                  {parts}
                </>
              )}
            </ToneContext.Provider>
          </ConfirmContext.Provider>
        </AlertDialogPrimitive.Content>
      </AlertDialogPortal>
    );
  }
);
AlertDialogContent.displayName = "AlertDialogContent";

const AlertDialogHeader = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-1.5 text-left", className)}
      {...props}
    />
  );
});
AlertDialogHeader.displayName = "AlertDialogHeader";

const AlertDialogFooter = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  );
});
AlertDialogFooter.displayName = "AlertDialogFooter";

const AlertDialogMedia = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  const { tone, claimMedia } = React.useContext(ToneContext);
  const auto = (props as { "data-auto"?: string })["data-auto"] !== undefined;
  React.useLayoutEffect(() => {
    if (auto) return undefined;
    claimMedia(true);
    return () => claimMedia(false);
  }, [auto, claimMedia]);
  return (
    <div
      ref={ref}
      data-slot="alert-dialog-media"
      data-tone={tone ?? "neutral"}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center *:[svg:not([class*='size-'])]:size-5",
        className
      )}
      {...props}
    />
  );
});
AlertDialogMedia.displayName = "AlertDialogMedia";

const AlertDialogTitle = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      data-slot="alert-dialog-title"
      className={cn("", className)}
      {...props}
    />
  );
});
AlertDialogTitle.displayName = "AlertDialogTitle";

const AlertDialogDescription = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      data-slot="alert-dialog-description"
      className={cn(
        "text-muted-foreground text-balance md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  );
});
AlertDialogDescription.displayName = "AlertDialogDescription";

const AlertDialogAction = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action> &
    Pick<React.ComponentPropsWithoutRef<typeof Button>, "variant" | "size">
>(({ className, variant = "default", size = "default", asChild, disabled, ...props }, ref) => {
  const { ready } = React.useContext(ConfirmContext);
  if (asChild)
    return (
      <AlertDialogPrimitive.Action
        ref={ref}
        asChild
        data-slot="alert-dialog-action"
        className={className}
        disabled={disabled || !ready}
        {...props}
      />
    );
  return (
    <Button variant={variant} size={size} disabled={disabled || !ready} asChild>
      <AlertDialogPrimitive.Action
        ref={ref}
        data-slot="alert-dialog-action"
        className={cn(className)}
        {...props}
      />
    </Button>
  );
});
AlertDialogAction.displayName = "AlertDialogAction";

const AlertDialogCancel = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel> &
    Pick<React.ComponentPropsWithoutRef<typeof Button>, "variant" | "size">
>(({ className, variant = "outline", size = "default", asChild, ...props }, ref) => {
  if (asChild)
    return (
      <AlertDialogPrimitive.Cancel
        ref={ref}
        asChild
        data-slot="alert-dialog-cancel"
        className={className}
        {...props}
      />
    );
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Cancel
        ref={ref}
        data-slot="alert-dialog-cancel"
        className={cn(className)}
        {...props}
      />
    </Button>
  );
});
AlertDialogCancel.displayName = "AlertDialogCancel";

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger
};
