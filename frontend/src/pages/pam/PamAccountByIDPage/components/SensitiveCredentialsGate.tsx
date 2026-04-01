import { EyeIcon, ShieldCheckIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
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

  const isPending = state.status === "loading" || state.status === "mfa-verifying";

  return (
    <div className={gateBaseClass}>
      <ProjectPermissionCan
        I={ProjectPermissionPamAccountActions.ReadCredentials}
        a={ProjectPermissionSub.PamAccounts}
      >
        {(isAllowed) => {
          const showMfa = isAllowed && requireMfa;
          return (
            <>
              <p className="text-sm font-medium">Sensitive Credentials</p>
              {!isPending && (
                <p className="text-xs text-accent">
                  {showMfa
                    ? "MFA verification required to view"
                    : "Click to reveal sensitive credentials"}
                </p>
              )}
              {state.status === "mfa-verifying" && (
                <p className="text-xs text-accent">Waiting for MFA verification...</p>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="outline"
                      size="xs"
                      className="relative"
                      isDisabled={!isAllowed}
                      isPending={isPending}
                      onClick={onReveal}
                    >
                      {showMfa ? (
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
              {state.status === "mfa-verifying" && (
                <Button variant="ghost" size="xs" onClick={onReset}>
                  Cancel
                </Button>
              )}
            </>
          );
        }}
      </ProjectPermissionCan>
    </div>
  );
};
