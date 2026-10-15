import { useId, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { format } from "date-fns";
import { CheckIcon, CircleAlertIcon, ShieldCheckIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  CopyButton,
  Detail,
  DetailLabel,
  DetailValue,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Spinner
} from "@app/components/v3";
import { AgentVaultOAuthStatus } from "@app/hooks/api/agentVault";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";

import {
  newOAuthAuthorizationId,
  OAUTH_STATUS_LABELS,
  storedOAuthCredential,
  TServiceForm
} from "./serviceSchema";
import { useOAuthAuthorize } from "./useOAuthAuthorize";

const hostOf = (serverUrl: string) => {
  try {
    return new URL(serverUrl).host;
  } catch {
    return "the server";
  }
};

const ScopeList = ({ scopes }: { scopes: string[] }) =>
  scopes.length ? (
    <div className="flex flex-wrap gap-1.5">
      {scopes.map((scope) => (
        <Badge key={scope} variant="outline" className="font-mono">
          {scope}
        </Badge>
      ))}
    </div>
  ) : (
    <span className="text-muted">None requested</span>
  );

const OAUTH_STATUS_VARIANTS = {
  [AgentVaultOAuthStatus.Connected]: "success",
  [AgentVaultOAuthStatus.NeedsReauthorization]: "danger",
  [AgentVaultOAuthStatus.NeedsAdditionalScopes]: "warning"
} as const;

export const OAuthStatusBadge = ({ status }: { status: AgentVaultOAuthStatus }) => (
  <Badge variant={OAUTH_STATUS_VARIANTS[status]}>
    {status === AgentVaultOAuthStatus.Connected ? <CheckIcon /> : <CircleAlertIcon />}
    {OAUTH_STATUS_LABELS[status]}
  </Badge>
);

type Props = {
  accessBundleId: string;
  service?: TAgentVaultService | null;
};

export const OAuthAuthorizeCard = ({ accessBundleId, service }: Props) => {
  const {
    control,
    register,
    setValue,
    formState: { errors }
  } = useFormContext<TServiceForm>();
  const [serverUrl, authorizationId, authorizedUrl, scopes, clientId = "", clientSecret = ""] =
    useWatch({
      control,
      name: [
        "serverUrl",
        "oauthAuthorizationId",
        "oauthAuthorizedUrl",
        "oauthScopes",
        "oauthClientId",
        "oauthClientSecret"
      ]
    });
  const clientIdInputId = useId();
  const clientSecretInputId = useId();
  // The server reuses a stored client on reauthorization, so a rotated or expired one can only be
  // replaced by entering it here.
  const [isReplacingClient, setIsReplacingClient] = useState(false);

  const trimmedUrl = serverUrl.trim();
  const host = hostOf(trimmedUrl);
  const isNewlyAuthorized = Boolean(
    newOAuthAuthorizationId({
      serverUrl,
      oauthAuthorizationId: authorizationId,
      oauthAuthorizedUrl: authorizedUrl
    })
  );
  const stored = storedOAuthCredential(service, serverUrl);

  const { state, isClientRequired, redirectUri, registrationError, authorize, cancel } =
    useOAuthAuthorize({
      onAuthorized: (authorization) => {
        setValue("oauthAuthorizedUrl", trimmedUrl, { shouldDirty: true });
        setValue("oauthScopes", authorization.scopes, { shouldDirty: true });
        setValue("oauthAuthorizationId", authorization.id, {
          shouldDirty: true,
          shouldValidate: true
        });
      }
    });

  const isWaiting = state.status === "starting" || state.status === "pending";
  const isClientEntered = isClientRequired || isReplacingClient;

  const keepSavedClient = () => {
    setIsReplacingClient(false);
    setValue("oauthClientId", "");
    setValue("oauthClientSecret", "");
  };

  const handleAuthorize = () =>
    authorize({
      accessBundleId,
      serverUrl: trimmedUrl,
      ...(stored && service ? { serviceId: service.id } : {}),
      ...(isClientEntered
        ? { clientId: clientId.trim(), clientSecret: clientSecret || undefined }
        : {})
    });

  const hasAuthorization = isNewlyAuthorized || Boolean(stored);
  const authorizeLabel = hasAuthorization ? "Reauthorize" : "Authorize";

  const renderStatus = () => {
    if (isNewlyAuthorized) {
      return (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="success">
              <CheckIcon />
              Authorized
            </Badge>
            <span className="text-sm text-muted">
              {stored ? "Saving replaces the stored tokens." : `Connected to ${host}.`}
            </span>
          </div>
          <Detail>
            <DetailLabel>Granted Scopes</DetailLabel>
            <DetailValue>
              <ScopeList scopes={scopes} />
            </DetailValue>
          </Detail>
        </div>
      );
    }

    if (stored) {
      return (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <OAuthStatusBadge status={stored.status} />
            {stored.status === AgentVaultOAuthStatus.NeedsReauthorization && (
              <span className="text-sm text-muted">
                The server no longer accepts the stored tokens. Reauthorize to restore access.
              </span>
            )}
            {stored.status === AgentVaultOAuthStatus.NeedsAdditionalScopes && (
              <span className="text-sm text-muted">
                A tool call needed scopes this authorization lacks. Reauthorize to grant them.
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <Detail>
              <DetailLabel>Granted Scopes</DetailLabel>
              <DetailValue>
                <ScopeList scopes={stored.grantedScopes} />
              </DetailValue>
            </Detail>
            {stored.status === AgentVaultOAuthStatus.NeedsAdditionalScopes &&
              stored.requiredScopes.length > 0 && (
                <Detail>
                  <DetailLabel>Missing Scopes</DetailLabel>
                  <DetailValue>
                    <ScopeList scopes={stored.requiredScopes} />
                  </DetailValue>
                </Detail>
              )}
            <Detail>
              <DetailLabel>Authorized By</DetailLabel>
              <DetailValue>
                {stored.authorizedBy?.username ?? "Unknown"}
                {stored.authorizedAt && (
                  <>
                    {" on "}
                    <span className="font-mono">
                      {format(new Date(stored.authorizedAt), "MMM d, yyyy h:mm a")}
                    </span>
                  </>
                )}
              </DetailValue>
            </Detail>
          </div>
          {stored.lastError && (
            <Alert variant="warning">
              <CircleAlertIcon />
              <AlertDescription>Last refresh failed: {stored.lastError}</AlertDescription>
            </Alert>
          )}
        </div>
      );
    }

    return (
      <p className="text-sm text-muted">
        Sign in to {host} in a pop-up window. Infisical stores the tokens it returns, and the agent
        never sees them.
      </p>
    );
  };

  return (
    <Field>
      <FieldLabel>Authorization</FieldLabel>
      <FieldContent>
        <div className="flex flex-col gap-4 rounded-md border border-border bg-container p-4">
          <div className="flex items-start gap-3">
            <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">{renderStatus()}</div>
          </div>

          {isClientEntered && !isNewlyAuthorized && (
            <div className="flex flex-col gap-4 border-t border-border pt-4">
              {!isClientRequired && (
                <p className="text-sm text-muted">
                  Enter the client ID and secret of the OAuth app to use from now on. They replace
                  the saved client when you reauthorize. Its redirect URI must point to this
                  Infisical instance.
                </p>
              )}
              {isClientRequired && registrationError && (
                <>
                  <Alert variant="warning">
                    <CircleAlertIcon />
                    <AlertDescription>{registrationError}</AlertDescription>
                  </Alert>
                  <p className="text-sm text-muted">
                    Create an OAuth app with the provider, set its redirect URI to the one below,
                    then enter its client ID and secret.
                  </p>
                </>
              )}
              {isClientRequired && !registrationError && (
                <p className="text-sm text-muted">
                  {host} doesn&apos;t let Infisical register itself as a client. Create an OAuth app
                  with the provider, set its redirect URI to the one below, then enter its client ID
                  and secret.
                </p>
              )}
              {redirectUri && (
                <Field>
                  <FieldLabel>Redirect URI</FieldLabel>
                  <FieldContent>
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-card px-2 py-1.5 font-mono text-xs">
                        {redirectUri}
                      </code>
                      <CopyButton value={redirectUri} ariaLabel="Copy redirect URI" />
                    </div>
                  </FieldContent>
                </Field>
              )}
              <div className="flex flex-col gap-3 md:flex-row">
                <Field className="flex-1">
                  <FieldLabel htmlFor={clientIdInputId}>Client ID</FieldLabel>
                  <FieldContent>
                    <Input
                      {...register("oauthClientId")}
                      id={clientIdInputId}
                      maxLength={512}
                      autoComplete="off"
                      spellCheck={false}
                      isError={Boolean(errors.oauthClientId)}
                    />
                    <FieldError>{errors.oauthClientId?.message}</FieldError>
                  </FieldContent>
                </Field>
                <Field className="flex-1">
                  <FieldLabel htmlFor={clientSecretInputId}>Client Secret</FieldLabel>
                  <FieldContent>
                    <Input
                      type="password"
                      {...register("oauthClientSecret")}
                      id={clientSecretInputId}
                      maxLength={1024}
                      autoComplete="new-password"
                      isError={Boolean(errors.oauthClientSecret)}
                    />
                    <FieldDescription>Leave empty for a public client.</FieldDescription>
                    <FieldError>{errors.oauthClientSecret?.message}</FieldError>
                  </FieldContent>
                </Field>
              </div>
            </div>
          )}

          {state.status === "failed" && (
            <Alert variant="danger">
              <CircleAlertIcon />
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          {isWaiting ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-sm text-muted">
                <Spinner size="xs" className="m-0 shrink-0 fill-product-av" />
                <span>
                  {state.status === "pending" && state.popupClosed
                    ? "Waiting for the authorization. If you closed the window before finishing, select Cancel and try again."
                    : `Waiting for you to finish signing in to ${host} in the pop-up window.`}
                </span>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={cancel}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={hasAuthorization ? "outline" : "av"}
                size="sm"
                onClick={handleAuthorize}
                isDisabled={!trimmedUrl || (isClientEntered && !clientId.trim())}
              >
                {state.status === "failed" ? "Try Again" : authorizeLabel}
              </Button>
              {stored && !isClientRequired && !isNewlyAuthorized && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={isReplacingClient ? keepSavedClient : () => setIsReplacingClient(true)}
                >
                  {isReplacingClient ? "Keep Saved Client" : "Use a Different Client"}
                </Button>
              )}
            </div>
          )}
        </div>
        <FieldError>{errors.oauthAuthorizationId?.message}</FieldError>
      </FieldContent>
    </Field>
  );
};
