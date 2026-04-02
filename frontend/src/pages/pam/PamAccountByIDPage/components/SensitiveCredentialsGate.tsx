import React from "react";
import { EyeIcon, LoaderCircleIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountActions } from "@app/context/ProjectPermissionContext/types";

import { type RevealState } from "./useCredentialsReveal";

type Props = {
  state: RevealState;
  onReveal: () => void;
  onReset: () => void;
  children: React.ReactElement;
};

const ButtonContent = ({ state }: { state: RevealState }) => {
  if (state.status === "loading") {
    return <LoaderCircleIcon className="animate-spin" />;
  }

  if (state.status === "mfa-verifying") {
    return (
      <>
        <LoaderCircleIcon className="animate-spin" />
        Waiting for MFA...
      </>
    );
  }

  return (
    <>
      <EyeIcon />
      View Credentials
    </>
  );
};

export const SensitiveCredentialsGate = ({ state, onReveal, onReset, children }: Props) => {
  if (state.status === "revealed") {
    return children;
  }

  const isMfaVerifying = state.status === "mfa-verifying";
  const isLoading = state.status === "loading";

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
                  isDisabled={!isAllowed || isLoading || isMfaVerifying}
                  onClick={onReveal}
                >
                  <ButtonContent state={state} />
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
      {isMfaVerifying && (
        <Button variant="ghost" size="xs" isFullWidth onClick={onReset}>
          Cancel
        </Button>
      )}
    </div>
  );
};
