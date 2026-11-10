import * as React from "react";

import { useDescendantFlags } from "../lib/descendant-flags";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";

import helperStyles from "./helpers.module.css";

const alertFlags = {
  "data-has-icon": ":scope > svg",
  "data-has-title": `:scope > .${helperStyles.alertTitle}`,
  "data-has-action": ':scope > [data-slot="alert-action"]'
};
const alertWatch = { subtree: false };

function Alert({
  className,
  variant,
  tone = variant === "destructive" ? "bad" : "neutral",
  title,
  actions,
  onDismiss,
  children,
  ref,
  ...props
}: Omit<React.ComponentPropsWithoutRef<"div">, "title"> & {
  variant?: "default" | "destructive" | null;
  tone?: "neutral" | "info" | "ok" | "warn" | "bad";
  title?: string;
  actions?: React.ReactNode;
  onDismiss?: () => void;
} & { ref?: React.Ref<React.ComponentRef<"div">> }) {
  const alertRef = useDescendantFlags(alertFlags, alertWatch, ref);
  return (
    <div
      ref={alertRef}
      data-slot="alert"
      data-variant={variant ?? "default"}
      role={tone === "bad" ? "alert" : "status"}
      data-tone={tone}
      className={cn(helperStyles.alert, className)}
      {...props}
    >
      {title ? (
        <>
          <Icon
            name={
              tone === "bad"
                ? "alert-c"
                : tone === "ok"
                  ? "check-c"
                  : tone === "warn"
                    ? "alert"
                    : "info"
            }
          />
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>
            {children}
            {actions && <div className={helperStyles.alertActions}>{actions}</div>}
          </AlertDescription>
        </>
      ) : (
        children
      )}
      {onDismiss && (
        <AlertAction>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss alert"
            onClick={onDismiss}
          >
            <Icon name="x" />
          </Button>
        </AlertAction>
      )}
    </div>
  );
}
Alert.displayName = "Alert";

function AlertTitle({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-slot="alert-title"
      className={cn(
        helperStyles.alertTitle,
        "[&_a:not([data-slot=button])]:underline [&_a:not([data-slot=button])]:underline-offset-3 [&_a:not([data-slot=button])]:hover:text-foreground",
        className
      )}
      {...props}
    />
  );
}
AlertTitle.displayName = "AlertTitle";

function AlertDescription({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-slot="alert-description"
      className={cn(
        helperStyles.alertDescription,
        "text-muted-foreground text-balance md:text-pretty [&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    />
  );
}
AlertDescription.displayName = "AlertDescription";

function AlertAction({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-slot="alert-action"
      className={cn(helperStyles.alertAction, className)}
      {...props}
    />
  );
}
AlertAction.displayName = "AlertAction";

export { Alert, AlertAction, AlertDescription, AlertTitle };

export const Banner = ({
  icon = "lock",
  children,
  action,
  onDismiss,
  className
}: {
  icon?: IconName;
  children: React.ReactNode;
  action?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}) => (
  <div data-slot="banner" role="status" className={cn(helperStyles.banner, className)}>
    <Icon name={icon} />
    <span className={helperStyles.bannerText}>{children}</span>
    {action}
    {onDismiss && (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss banner"
        onClick={onDismiss}
      >
        <Icon name="x" />
      </Button>
    )}
  </div>
);
