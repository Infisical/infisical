import { EyeIcon, ShieldCheckIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Spinner } from "@app/components/v2";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountActions } from "@app/context/ProjectPermissionContext/types";

import { type RevealState } from "./useCredentialsReveal";

type Props = {
  state: RevealState;
  requireMfa: boolean;
  onReveal: () => void;
  onReset: () => void;
  onRetry: () => void;
  children: React.ReactNode;
};

const gateBaseClass =
  "flex flex-col items-center gap-3 rounded-md border border-dashed border-border/60 bg-mineshaft-600/20 p-4 text-center";

const iconContainerClass =
  "flex size-10 items-center justify-center rounded-full bg-mineshaft-600/40";

export const SensitiveCredentialsGate = ({
  state,
  requireMfa,
  onReveal,
  onReset,
  onRetry,
  children
}: Props) => {
  if (state.status === "revealed") {
    return <>{children}</>;
  }

  if (state.status === "loading") {
    return (
      <div className={gateBaseClass}>
        <div className={iconContainerClass}>
          <Spinner className="size-5" />
        </div>
        <p className="text-sm font-medium">Loading credentials...</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className={gateBaseClass}>
        <p className="text-destructive text-sm">{state.message}</p>
        <Button variant="outline" size="xs" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (state.status === "mfa-verifying") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-warning/40 bg-warning/5 p-4 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-warning/10">
          <Spinner className="size-5 text-warning" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Verification In Progress</p>
          <p className="text-xs text-accent">Waiting for MFA verification to complete</p>
        </div>
        <Button variant="ghost" size="xs" onClick={onReset}>
          Cancel
        </Button>
      </div>
    );
  }

  // Hidden state
  return (
    <div className={gateBaseClass}>
      <ProjectPermissionCan
        I={ProjectPermissionPamAccountActions.ReadCredentials}
        a={ProjectPermissionSub.PamAccounts}
      >
        {(isAllowed) => (
          <>
            <div className={iconContainerClass}>
              {isAllowed && requireMfa ? (
                <ShieldCheckIcon className="text-muted-foreground size-5" />
              ) : (
                <EyeIcon className="text-muted-foreground size-5" />
              )}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Sensitive Credentials</p>
              {isAllowed && requireMfa && (
                <p className="text-xs text-accent">MFA verification required to view</p>
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" size="xs" isDisabled={!isAllowed} onClick={onReveal}>
                    {isAllowed && requireMfa ? (
                      <>
                        <ShieldCheckIcon className="size-4" />
                        Verify & View
                      </>
                    ) : (
                      <>
                        <EyeIcon className="size-4" />
                        View Credentials
                      </>
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              {!isAllowed && (
                <TooltipContent side="right">
                  You do not have permission to view credentials
                </TooltipContent>
              )}
            </Tooltip>
          </>
        )}
      </ProjectPermissionCan>
    </div>
  );
};
