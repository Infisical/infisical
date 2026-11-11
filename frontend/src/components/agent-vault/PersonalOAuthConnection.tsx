import { ReactNode, useEffect } from "react";
import { format } from "date-fns";
import { CheckIcon, InfoIcon } from "lucide-react";

import {
  Button,
  IconButton,
  Item,
  ItemActions,
  ItemContent,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { AgentVaultOauthStatus } from "@app/hooks/api/agentVault";
import {
  TAgentVaultPersonalOauthConnection,
  TAgentVaultService
} from "@app/hooks/api/agentVault/types";

import { OAuthStatusBadge } from "./service-sheet/OAuthAuthorizeCard";
import { hostOf, serverUrlOf } from "./service-sheet/serviceSchema";
import { useOAuthAuthorize } from "./service-sheet/useOAuthAuthorize";

type Props = {
  service: TAgentVaultService;
  connection: TAgentVaultPersonalOauthConnection | null;
  isSaving: boolean;
  // Saves the completed sign-in as the caller's connection, at once: there is no separate Save step.
  onAuthorized: (authorizationId: string) => Promise<void>;
  // Closing the dialog mid sign-in stops the poll, so an approved sign-in would never be saved.
  onWaitingChange: (isWaiting: boolean) => void;
};

/** The caller's own account connection for a service that leaves its OAuth sign-in to each member. */
export const PersonalOAuthConnection = ({
  service,
  connection,
  isSaving,
  onAuthorized,
  onWaitingChange
}: Props) => {
  const serverUrl = serverUrlOf(service) ?? "";
  const host = hostOf(serverUrl);
  const { state, authorize, cancel } = useOAuthAuthorize({
    // A refused save is reported by the request's error toast.
    onAuthorized: (authorization) => onAuthorized(authorization.id).catch(() => undefined)
  });
  const isWaiting = state.status === "starting" || state.status === "pending";
  useEffect(() => {
    onWaitingChange(isWaiting);
    return () => onWaitingChange(false);
  }, [isWaiting]);

  const connect = () => {
    authorize({
      accessBundleId: service.accessBundleId,
      serverUrl,
      serviceId: service.id,
      personal: true
    });
  };

  let detail: ReactNode = null;
  let problem: string | null = null;
  if (state.status === "failed") problem = state.message;
  else if (!connection) detail = "Not connected yet.";
  else if (connection.status === AgentVaultOauthStatus.NeedsReauthorization) {
    detail = connection.lastError ?? `${host} no longer accepts this connection. Reconnect it.`;
  } else if (connection.status === AgentVaultOauthStatus.NeedsAdditionalScopes) {
    detail = "An agent requested scopes that aren't granted yet. Reconnect to add them.";
  } else {
    detail = (
      <span className="flex items-center gap-1 text-success">
        <CheckIcon className="size-3.5" />
        Connected
      </span>
    );
  }

  const isProblem =
    Boolean(problem) || (connection && connection.status !== AgentVaultOauthStatus.Connected);

  let action: ReactNode;
  if (isSaving) {
    action = (
      <Button type="button" variant="outline" size="sm" isDisabled>
        <Spinner size="xs" variant="av" />
        Saving...
      </Button>
    );
  } else if (isWaiting) {
    action = (
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" isDisabled>
          <Spinner size="xs" variant="av" />
          Waiting for sign-in...
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={cancel}>
          Cancel
        </Button>
      </div>
    );
  } else {
    action = (
      <Button
        type="button"
        variant={connection && !isProblem ? "outline" : "av"}
        size="sm"
        className="shrink-0"
        onClick={connect}
      >
        {connection ? "Reconnect" : "Connect Account"}
      </Button>
    );
  }

  const requestedScopes =
    connection?.requiredScopes.filter((scope) => !connection.grantedScopes.includes(scope)) ?? [];

  return (
    <Item variant="outline">
      <ItemContent className="min-w-0">
        <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
          <span className="truncate" title={host}>
            {host}
          </span>
          {connection && !problem && isProblem && <OAuthStatusBadge status={connection.status} />}
          {connection && (
            <Tooltip hoverable>
              <TooltipTrigger asChild>
                <IconButton
                  type="button"
                  variant="ghost-muted"
                  size="2xs"
                  className="shrink-0"
                  aria-label="Connection details"
                >
                  <InfoIcon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent className="flex max-h-64 max-w-xs flex-col gap-1 overflow-y-auto">
                {connection.authorizedAt && (
                  <span>
                    Connected on {format(new Date(connection.authorizedAt), "MMM d, yyyy")}
                  </span>
                )}
                <span>Scopes:</span>
                {connection.grantedScopes.length ? (
                  connection.grantedScopes.map((scope) => (
                    <span key={scope} className="break-all">
                      {scope}
                    </span>
                  ))
                ) : (
                  <span>None</span>
                )}
                {requestedScopes.length > 0 && (
                  <>
                    <span>Requested:</span>
                    {requestedScopes.map((scope) => (
                      <span key={scope} className="break-all">
                        {scope}
                      </span>
                    ))}
                  </>
                )}
              </TooltipContent>
            </Tooltip>
          )}
        </span>
        {problem && <span className="text-xs text-danger">{problem}</span>}
        {!problem && detail && <span className="text-xs text-muted">{detail}</span>}
      </ItemContent>
      <ItemActions>{action}</ItemActions>
    </Item>
  );
};
