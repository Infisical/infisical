"use client";

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";

import { useV4PortalContainer } from "@app/components/v4/scope";
import { Button } from "@app/components/v4/ui/button";
import { Icon, type IconName } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";

import { OverlayPendingContext, useDismissGuard, useOverlayPending } from "../lib/overlay-pending";
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

function AlertDialogTrigger({
  ref,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger ref={ref} data-slot="alert-dialog-trigger" {...props} />;
}
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

function AlertDialogOverlay({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      ref={ref}
      data-slot="alert-dialog-overlay"
      className={cn("z-50", overlay.scrim, className)}
      {...props}
    />
  );
}
AlertDialogOverlay.displayName = "AlertDialogOverlay";

function AlertDialogContent({
  className,
  size = "default",
  tone,
  icon,
  confirmText,
  pending = false,
  onEscapeKeyDown,
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> & {
  size?: "default" | "sm";
  /** danger shows a bad-tone lead tile (trash unless icon or AlertDialogMedia is given); neutral and unset show no automatic tile. */
  tone?: "danger" | "neutral";
  icon?: IconName;
  /** The exact text the person types before the action enables. */
  confirmText?: string;
  /** While true, Escape and Cancel are blocked, so an in-flight action cannot be abandoned. */
  pending?: boolean;
} & { ref?: React.Ref<React.ComponentRef<typeof AlertDialogPrimitive.Content>> }) {
  const escape = useOwnedEscape(ref, onEscapeKeyDown);
  const guard = useDismissGuard(pending, { onEscapeKeyDown: escape.onEscapeKeyDown });
  const [typed, setTyped] = React.useState("");
  const [hasMedia, setHasMedia] = React.useState(false);
  const toneValue = React.useMemo(() => ({ tone, claimMedia: setHasMedia }), [tone]);
  const fieldId = React.useId();
  const field = confirmText !== undefined && (
    <div key="confirm-field" data-slot="alert-dialog-confirm" className="flex flex-col gap-1.5">
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
        aria-busy={pending || undefined}
        className={cn(
          "group/alert-dialog-content z-50 data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm",
          overlay.pop,
          overlay.dialog,
          className
        )}
        {...props}
        onOpenAutoFocus={(event) => {
          props.onOpenAutoFocus?.(event);
          if (confirmText === undefined || event.defaultPrevented) return;
          setTyped("");
          event.preventDefault();
          document.getElementById(fieldId)?.focus();
        }}
        onEscapeKeyDown={guard.onEscapeKeyDown}
      >
        <OverlayPendingContext value={pending}>
          <ConfirmContext value={{ ready: confirmText === undefined || typed === confirmText }}>
            <ToneContext value={toneValue}>
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
            </ToneContext>
          </ConfirmContext>
        </OverlayPendingContext>
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  );
}
AlertDialogContent.displayName = "AlertDialogContent";

function AlertDialogHeader({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-1.5 text-left", className)}
      {...props}
    />
  );
}
AlertDialogHeader.displayName = "AlertDialogHeader";

function AlertDialogFooter({ className, ref, ...props }: React.ComponentProps<"div">) {
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
}
AlertDialogFooter.displayName = "AlertDialogFooter";

function AlertDialogMedia({ className, ref, ...props }: React.ComponentProps<"div">) {
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
}
AlertDialogMedia.displayName = "AlertDialogMedia";

function AlertDialogTitle({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      data-slot="alert-dialog-title"
      className={cn("", className)}
      {...props}
    />
  );
}
AlertDialogTitle.displayName = "AlertDialogTitle";

function AlertDialogDescription({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
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
}
AlertDialogDescription.displayName = "AlertDialogDescription";

function AlertDialogAction({
  className,
  variant = "default",
  size = "default",
  asChild,
  disabled,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action> &
  Pick<React.ComponentPropsWithoutRef<typeof Button>, "variant" | "size"> & {
    ref?: React.Ref<React.ComponentRef<typeof AlertDialogPrimitive.Action>>;
  }) {
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
}
AlertDialogAction.displayName = "AlertDialogAction";

function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  asChild,
  disabled,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel> &
  Pick<React.ComponentPropsWithoutRef<typeof Button>, "variant" | "size"> & {
    ref?: React.Ref<React.ComponentRef<typeof AlertDialogPrimitive.Cancel>>;
  }) {
  const pending = useOverlayPending();
  if (asChild)
    return (
      <AlertDialogPrimitive.Cancel
        ref={ref}
        asChild
        data-slot="alert-dialog-cancel"
        className={className}
        disabled={disabled || pending}
        {...props}
      />
    );
  return (
    <Button variant={variant} size={size} disabled={disabled || pending} asChild>
      <AlertDialogPrimitive.Cancel
        ref={ref}
        data-slot="alert-dialog-cancel"
        className={cn(className)}
        {...props}
      />
    </Button>
  );
}
AlertDialogCancel.displayName = "AlertDialogCancel";

function DiscardChangesAlertDialog({
  open,
  onOpenChange,
  onDiscard,
  title = "Discard Changes?",
  description = "Your changes will be lost."
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent tone="danger" icon="alert">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Editing</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDiscard}>
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
DiscardChangesAlertDialog.displayName = "DiscardChangesAlertDialog";

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
  AlertDialogTrigger,
  DiscardChangesAlertDialog
};
