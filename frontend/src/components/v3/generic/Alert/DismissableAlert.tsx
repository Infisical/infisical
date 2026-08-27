/* eslint-disable react/prop-types */

import * as React from "react";
import { XIcon } from "lucide-react";

import { cn } from "../../utils";
import { AnimatedCollapse } from "../AnimatedCollapse";
import { IconButton } from "../IconButton";
import { Alert, AlertDescription, AlertTitle } from "./Alert";

type DismissableAlertProps = React.ComponentProps<typeof Alert> & {
  /**
   * The identifier used to persist the dismissal in local storage. Must be
   * unique per banner so dismissals don't collide.
   */
  actionKey: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
};

const DISMISSED_ALERT_STORAGE_PREFIX = "infisical:dismissed-alert:";

const getDismissedAlertStorageKey = (actionKey: string) =>
  `${DISMISSED_ALERT_STORAGE_PREFIX}${actionKey}`;

const isAlertDismissed = (actionKey: string) => {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(getDismissedAlertStorageKey(actionKey)) !== null;
  } catch {
    return false;
  }
};

const persistAlertDismissal = (actionKey: string) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(getDismissedAlertStorageKey(actionKey), "true");
  } catch {
    // The in-memory state still dismisses the alert for the current session.
  }
};

/**
 * A `variant="info"` (or any variant) informational Alert that a user can
 * permanently dismiss. Dismissal is persisted in local storage, so the notice
 * stays hidden across reloads in the current browser profile once closed.
 *
 * Pass `children` for full control over the Alert body (icon + title +
 * description, links, etc.), or the convenience `title`/`description` props for
 * simple notices. The close affordance is rendered by this wrapper — the shared
 * `Alert` primitive is left untouched.
 */
function DismissableAlert({
  actionKey,
  title,
  description,
  children,
  className,
  ...props
}: DismissableAlertProps) {
  const [isDismissing, setIsDismissing] = React.useState(false);
  const [isLocallyDismissed, setIsLocallyDismissed] = React.useState(() =>
    isAlertDismissed(actionKey)
  );

  const handleDismiss = () => {
    persistAlertDismissal(actionKey);
    // Under prefers-reduced-motion the collapse transition never runs, so its
    // end event never fires; unmount immediately instead.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsLocallyDismissed(true);
      return;
    }
    setIsDismissing(true);
  };

  if (isLocallyDismissed) {
    return null;
  }

  return (
    <AnimatedCollapse
      isOpen={!isDismissing}
      onTransitionEnd={(event) => {
        // transitionend bubbles and fires once per property; unmount only when
        // the wrapper's own row collapse completes.
        if (
          isDismissing &&
          event.target === event.currentTarget &&
          event.propertyName === "grid-template-rows"
        ) {
          setIsLocallyDismissed(true);
        }
      }}
    >
      <Alert className={cn("pr-10", className)} {...props}>
        {children ?? (
          <>
            {title && <AlertTitle>{title}</AlertTitle>}
            {description && <AlertDescription>{description}</AlertDescription>}
          </>
        )}
        <IconButton
          variant="ghost"
          size="xs"
          aria-label="Dismiss notice"
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-current"
        >
          <XIcon />
        </IconButton>
      </Alert>
    </AnimatedCollapse>
  );
}

export { DismissableAlert };
