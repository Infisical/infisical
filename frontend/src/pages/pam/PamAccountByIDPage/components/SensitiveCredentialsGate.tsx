import { EyeIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountActions } from "@app/context/ProjectPermissionContext/types";

import { type RevealState } from "./useCredentialsReveal";

type Props = {
  state: RevealState;
  onReveal: () => void;
  onReset: () => void;
  onRetry: () => void;
  children: React.ReactNode;
};

export const SensitiveCredentialsGate = ({
  state,
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
      <div className="flex flex-col gap-2">
        <p className="text-destructive text-sm">{state.message}</p>
        <Button variant="outline" size="md" isFullWidth onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  const isPending = state.status === "loading" || state.status === "mfa-verifying";

  return (
    <div className="flex flex-col gap-2">
      <ProjectPermissionCan
        I={ProjectPermissionPamAccountActions.ReadCredentials}
        a={ProjectPermissionSub.PamAccounts}
      >
        {(isAllowed) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="w-full">
                <Button
                  variant="outline"
                  size="md"
                  className="relative"
                  isFullWidth
                  isDisabled={!isAllowed}
                  isPending={isPending}
                  onClick={onReveal}
                >
                  <EyeIcon />
                  {state.status === "mfa-verifying" ? "Waiting for MFA..." : "View Credentials"}
                </Button>
              </span>
            </TooltipTrigger>
            {!isAllowed && (
              <TooltipContent side="right">
                You do not have permission to view credentials
              </TooltipContent>
            )}
          </Tooltip>
        )}
      </ProjectPermissionCan>
      {state.status === "mfa-verifying" && (
        <>
          <p className="text-center text-xs text-accent">Waiting for MFA...</p>
          <Button variant="ghost" size="xs" isFullWidth onClick={onReset}>
            Cancel
          </Button>
        </>
      )}
    </div>
  );
};
