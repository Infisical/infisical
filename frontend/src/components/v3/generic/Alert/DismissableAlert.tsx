/* eslint-disable react/prop-types */

import * as React from "react";
import { XIcon } from "lucide-react";

import { useGetUserAction, useRegisterUserAction } from "@app/hooks/api/users";

import { cn } from "../../utils";
import { IconButton } from "../IconButton";
import { Alert, AlertDescription, AlertTitle } from "./Alert";

type DismissableAlertProps = React.ComponentProps<typeof Alert> & {
  /**
   * The `user_actions` action string used to persist the dismissal per-user via
   * `/api/v1/user-action`. Must be unique per banner so dismissals don't collide.
   */
  actionKey: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
};

/**
 * A `variant="info"` (or any variant) informational Alert that a user can
 * permanently dismiss. Dismissal is persisted server-side through the existing
 * `user_actions` flag store, so the notice stays hidden across reloads and
 * devices once closed.
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
  const { data: userAction, isPending } = useGetUserAction(actionKey);
  const { mutate: registerUserAction } = useRegisterUserAction();
  const [isLocallyDismissed, setIsLocallyDismissed] = React.useState(false);

  const handleDismiss = () => {
    // hide immediately (optimistic) and persist so it stays gone everywhere.
    setIsLocallyDismissed(true);
    registerUserAction(actionKey);
  };

  // Gate on the query result to avoid flashing the banner before we know
  // whether it was already dismissed. Render nothing until the flag resolves.
  if (isPending || Boolean(userAction) || isLocallyDismissed) {
    return null;
  }

  return (
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
  );
}

export { DismissableAlert };
