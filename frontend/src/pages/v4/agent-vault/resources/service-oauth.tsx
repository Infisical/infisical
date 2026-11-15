import { type ReactNode, useEffect, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Item } from "@infisical/cipher/ui/item";
import { Inline, InlineGrow, Stack } from "@infisical/cipher/ui/layout";
import { CopyButton } from "@infisical/cipher/ui/sensitive-editor";
import { Switch } from "@infisical/cipher/ui/switch";
import { SmallText, StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

import {
  hostOf,
  isMemberProvidedOAuthService,
  newOAuthAuthorizationId,
  OAUTH_OWN_APP_REQUIRED_ERROR,
  OAUTH_STATUS_LABELS,
  oauthClientIdSchema,
  oauthClientSecretSchema,
  serverUrlOf,
  storedOAuthCredential
} from "@app/components/agent-vault/service-sheet/serviceSchema";
import {
  AgentVaultCredentialType,
  AgentVaultOauthStatus,
  AgentVaultVariableReferenceField
} from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultPersonalOauthConnection,
  TAgentVaultService
} from "@app/hooks/api/agentVault/types";

import { formatDay } from "./agent-vault-utils";
import { useOAuthAuthorize } from "./oauth";
import type { TServiceFormApi } from "./service-form";

const CALLBACK_PATH = "/agent-vault/oauth/callback";

const STATUS_TONE = {
  [AgentVaultOauthStatus.Connected]: "ok",
  [AgentVaultOauthStatus.NeedsReauthorization]: "bad",
  [AgentVaultOauthStatus.NeedsAdditionalScopes]: "warn"
} as const;

export const OAuthStatusBadge = ({ status }: { status: AgentVaultOauthStatus }) => (
  <Badge tone={STATUS_TONE[status]} dot>
    {OAUTH_STATUS_LABELS[status]}
  </Badge>
);

const STATUS_ICON = { ok: "check-c", warn: "alert", bad: "alert-c" } as const;

const scopeText = (scopes: string[]) => (scopes.length ? scopes.join(", ") : "None");

const Scopes = ({ granted, requested }: { granted: string[]; requested: string[] }) => (
  <Stack gap={2}>
    <SmallText muted>Scopes: {scopeText(granted)}</SmallText>
    {requested.length > 0 && <SmallText muted>Requested: {requested.join(", ")}</SmallText>}
  </Stack>
);

export const OAuthAuthorizeCard = ({
  projectId,
  service,
  api,
  onWaitingChange
}: {
  projectId: string;
  service?: TAgentVaultService;
  api: TServiceFormApi;
  onWaitingChange: (isWaiting: boolean) => void;
}) => {
  const { form, set, patch, err, setErrors } = api;
  const trimmedUrl = form.serverUrl.trim();
  const host = hostOf(trimmedUrl);
  const isMemberProvided = form.memberProvidedFields.length > 0;
  const isNewlyAuthorized = Boolean(newOAuthAuthorizationId(form));
  const stored = storedOAuthCredential(service, form.serverUrl);
  const [isUsingOwnApp, setIsUsingOwnApp] = useState(() =>
    Boolean(form.oauthClientId || form.oauthClientSecret)
  );
  const isOwnAppRequiredBySave = Boolean(err(OAUTH_OWN_APP_REQUIRED_ERROR));

  const { state, isWaiting, isClientRequired, isOAuthAdvertised, redirectUri, authorize, cancel } =
    useOAuthAuthorize({
      onAuthorized: (authorization) => {
        patch({
          oauthAuthorizationRejection: "",
          oauthAuthorizedUrl: trimmedUrl,
          oauthScopes: authorization.scopes,
          oauthAuthorizationId: authorization.id
        });
      }
    });

  useEffect(() => {
    onWaitingChange(isWaiting);
  }, [isWaiting, onWaitingChange]);
  useEffect(() => () => onWaitingChange(false), [onWaitingChange]);

  const wantsOwnApp =
    (isClientRequired && !isMemberProvided) || isUsingOwnApp || isOwnAppRequiredBySave;
  const isOwnApp = wantsOwnApp && (isMemberProvided || !isNewlyAuthorized);
  const hasAuthorization = isNewlyAuthorized || Boolean(stored);
  const storedMemberClientId =
    isMemberProvided && service?.credential.type === AgentVaultCredentialType.OAuth
      ? (service.credential.clientId ?? "")
      : "";
  const isStoredClientKept =
    Boolean(storedMemberClientId) && (form.oauthClientId ?? "").trim() === storedMemberClientId;

  const switchToOwnApp = () => {
    setIsUsingOwnApp(true);
    set("oauthAutomaticSetup", false);
  };
  const switchToAutomaticSetup = () => {
    setIsUsingOwnApp(false);
    patch({ oauthAutomaticSetup: true, oauthClientId: "", oauthClientSecret: "" });
  };

  const changeMemberProvided = (isOn: boolean) => {
    const change: Partial<TServiceFormApi["form"]> = {
      memberProvidedFields: isOn ? [AgentVaultVariableReferenceField.CredentialValue] : []
    };
    if (isOn) {
      cancel();
      Object.assign(change, { oauthAuthorizationId: "", oauthAuthorizationRejection: "" });
      const savedMemberClientId =
        service?.credential.type === AgentVaultCredentialType.OAuth
          ? (service.credential.clientId ?? "")
          : "";
      if (savedMemberClientId && !(form.oauthClientId ?? "").trim()) {
        Object.assign(change, { oauthClientId: savedMemberClientId, oauthAutomaticSetup: false });
        setIsUsingOwnApp(true);
      }
    } else if (isMemberProvidedOAuthService(service)) {
      setIsUsingOwnApp(false);
      Object.assign(change, {
        oauthAutomaticSetup: true,
        oauthClientId: "",
        oauthClientSecret: ""
      });
    }
    patch(change);
    setErrors({});
  };

  // The popup has to open synchronously in this click, so the client fields are checked here rather than on save.
  const handleAuthorize = () => {
    if (wantsOwnApp) {
      const problems = {
        oauthClientId: oauthClientIdSchema.safeParse(form.oauthClientId),
        oauthClientSecret: oauthClientSecretSchema.safeParse(form.oauthClientSecret)
      };
      const next = Object.fromEntries(
        Object.entries(problems).map(([key, result]) => [
          key,
          result.success ? undefined : result.error.issues[0].message
        ])
      );
      setErrors((current) => ({ ...current, ...next }));
      if (Object.values(next).some(Boolean)) return;
    }
    set("oauthAuthorizationId", "");
    authorize({
      projectId,
      serverUrl: trimmedUrl,
      ...(service ? { serviceId: service.id } : {}),
      ...(wantsOwnApp
        ? {
            clientId: (form.oauthClientId ?? "").trim(),
            clientSecret: form.oauthClientSecret || undefined
          }
        : {}),
      ...(!wantsOwnApp && form.oauthAutomaticSetup ? { registration: "dynamic" as const } : {})
    });
  };

  const granted = new Set(stored?.grantedScopes);
  const requested = stored ? stored.requiredScopes.filter((scope) => !granted.has(scope)) : [];
  const isProblem =
    state.status === "failed" ||
    (stored && stored.status !== AgentVaultOauthStatus.Connected && !isNewlyAuthorized);

  let authorizeLabel = "Authorize";
  if (state.status === "failed") authorizeLabel = "Try again";
  else if (hasAuthorization) authorizeLabel = "Reauthorize";

  const authorizeButton = isWaiting ? (
    <Inline gap={8}>
      <Button type="button" variant="outline" size="sm" loading loadingLabel="Waiting for sign-in">
        Authorize
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={cancel}>
        Cancel
      </Button>
    </Inline>
  ) : (
    <Button
      type="button"
      variant={hasAuthorization && !isProblem ? "outline" : "primary"}
      size="sm"
      disabled={!trimmedUrl || (wantsOwnApp && !(form.oauthClientId ?? "").trim())}
      onClick={handleAuthorize}
    >
      {authorizeLabel}
    </Button>
  );

  const memberAuthorizeButton = (
    <Button
      type="button"
      variant="primary"
      size="sm"
      disabledReason={`Each member connects their own ${host || "server"} account from the access bundle page, so there is nothing to authorize here.`}
    >
      Authorize
    </Button>
  );

  const status = ((): { title: string; tone: "bad" | "warn" | "ok"; detail?: ReactNode } | null => {
    if (isMemberProvided) return null;
    if (state.status === "failed")
      return { title: "Couldn't authorize", tone: "bad", detail: state.message };
    if (isNewlyAuthorized)
      return {
        title: stored ? "Reauthorized" : "Authorized",
        tone: "ok",
        detail: <Scopes granted={form.oauthScopes} requested={[]} />
      };
    if (!stored) return null;
    const scopes = <Scopes granted={stored.grantedScopes} requested={requested} />;
    if (stored.status === AgentVaultOauthStatus.NeedsReauthorization)
      return {
        title: OAUTH_STATUS_LABELS[stored.status],
        tone: "bad",
        detail: `${host} no longer accepts this authorization.`
      };
    if (stored.status === AgentVaultOauthStatus.NeedsAdditionalScopes)
      return {
        title: OAUTH_STATUS_LABELS[stored.status],
        tone: "warn",
        detail: (
          <Stack gap={2}>
            <SmallText muted>
              An agent requested scopes that aren&apos;t granted yet. Reauthorize to add them.
            </SmallText>
            {scopes}
          </Stack>
        )
      };
    return {
      title: OAUTH_STATUS_LABELS[stored.status],
      tone: "ok",
      detail: (
        <Stack gap={2}>
          {stored.lastError && (
            <Tooltip content={stored.lastError}>
              <SmallText muted tabIndex={0}>
                The last token refresh failed.
              </SmallText>
            </Tooltip>
          )}
          {scopes}
        </Stack>
      )
    };
  })();

  const callbackUri = redirectUri ?? `${window.location.origin}${CALLBACK_PATH}`;

  return (
    <Stack gap={16}>
      <Switch
        label="Each member connects their own account"
        description={
          isMemberProvided
            ? `A session uses the ${host || "server"} account of whoever started it.`
            : `Every session uses the account you authorize here.`
        }
        checked={isMemberProvided}
        disabled={isWaiting}
        onChange={changeMemberProvided}
      />
      <Field label="Authorization" error={err("oauthAuthorizationId")}>
        <Stack gap={12}>
          {status && (
            <Item
              variant="outline"
              title={
                <StatusText tone={status.tone} icon={STATUS_ICON[status.tone]}>
                  {status.title}
                </StatusText>
              }
              description={status.detail}
              actions={!isOwnApp ? authorizeButton : undefined}
            />
          )}
          {!status && !isOwnApp && (
            <div>{isMemberProvided ? memberAuthorizeButton : authorizeButton}</div>
          )}
          {isOwnApp && (
            <Stack gap={16}>
              {isClientRequired && !isOAuthAdvertised && !isMemberProvided && (
                <Alert tone="warn" title={`${host} doesn't look like it uses OAuth`}>
                  It answered, but sent no OAuth challenge and serves no OAuth metadata. Check the
                  server URL. If the server does use OAuth, enter your OAuth app&apos;s client ID
                  and secret below.
                </Alert>
              )}
              <Field
                label="Redirect URI"
                description="Add this as a redirect URI in your OAuth app."
              >
                <Inline gap={8}>
                  <InlineGrow>
                    <Input mono readOnly value={callbackUri} aria-label="Redirect URI" />
                  </InlineGrow>
                  <CopyButton value={callbackUri} label="Copy redirect URI" iconOnly />
                </Inline>
              </Field>
              <Inline gap={12} align="start" wrap>
                <InlineGrow>
                  <Field label="Client ID" error={err("oauthClientId")}>
                    <Input
                      mono
                      maxLength={2048}
                      autoComplete="off"
                      spellCheck={false}
                      value={form.oauthClientId ?? ""}
                      invalid={Boolean(err("oauthClientId"))}
                      onChange={(event) => set("oauthClientId", event.target.value)}
                    />
                  </Field>
                </InlineGrow>
                <InlineGrow>
                  <Field label="Client secret" optional error={err("oauthClientSecret")}>
                    <Input
                      type="password"
                      maxLength={4096}
                      autoComplete="new-password"
                      placeholder={
                        isStoredClientKept ? "Leave blank to keep the saved secret" : undefined
                      }
                      value={form.oauthClientSecret ?? ""}
                      invalid={Boolean(err("oauthClientSecret"))}
                      onChange={(event) => set("oauthClientSecret", event.target.value)}
                    />
                  </Field>
                </InlineGrow>
              </Inline>
              <div>{isMemberProvided ? memberAuthorizeButton : authorizeButton}</div>
            </Stack>
          )}
          <Inline gap={12} wrap>
            {(isMemberProvided || (!isClientRequired && !isNewlyAuthorized && !isWaiting)) && (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={isUsingOwnApp ? switchToAutomaticSetup : switchToOwnApp}
              >
                {isUsingOwnApp ? "Use automatic setup" : "Use your own OAuth app"}
              </Button>
            )}
            {form.oauthAuthorizationRejection && stored && !isWaiting && !isMemberProvided && (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => {
                  set("oauthAuthorizationRejection", "");
                  setErrors((current) => ({ ...current, oauthAuthorizationId: undefined }));
                }}
              >
                Keep current login
              </Button>
            )}
          </Inline>
        </Stack>
      </Field>
    </Stack>
  );
};

export const PersonalOAuthConnection = ({
  projectId,
  service,
  connection,
  saving,
  onAuthorized,
  onWaitingChange
}: {
  projectId: string;
  service: TAgentVaultService;
  connection: TAgentVaultPersonalOauthConnection | null;
  saving: boolean;
  onAuthorized: (authorizationId: string) => Promise<void>;
  onWaitingChange: (isWaiting: boolean) => void;
}) => {
  const serverUrl = serverUrlOf(service) ?? "";
  const host = hostOf(serverUrl);
  const { state, isWaiting, authorize, cancel } = useOAuthAuthorize({
    onAuthorized: (authorization) => {
      onAuthorized(authorization.id).catch(() => undefined);
    }
  });
  useEffect(() => {
    onWaitingChange(isWaiting);
  }, [isWaiting, onWaitingChange]);
  useEffect(() => () => onWaitingChange(false), [onWaitingChange]);

  const problem = state.status === "failed" ? state.message : null;
  let detail: ReactNode = "Not connected yet";
  if (connection?.status === AgentVaultOauthStatus.NeedsReauthorization)
    detail = connection.lastError ?? `${host} no longer accepts this connection. Reconnect it.`;
  else if (connection?.status === AgentVaultOauthStatus.NeedsAdditionalScopes)
    detail = "An agent requested scopes that aren't granted yet. Reconnect to add them.";
  else if (connection) {
    const granted = new Set(connection.grantedScopes);
    const requested = connection.requiredScopes.filter((scope) => !granted.has(scope));
    detail = (
      <Stack gap={2}>
        {connection.authorizedAt && (
          <SmallText muted>Connected on {formatDay(connection.authorizedAt)}</SmallText>
        )}
        <Scopes granted={connection.grantedScopes} requested={requested} />
      </Stack>
    );
  }
  const isProblem =
    Boolean(problem) || (connection && connection.status !== AgentVaultOauthStatus.Connected);

  let action: ReactNode;
  if (saving)
    action = (
      <Button type="button" variant="outline" size="sm" loading loadingLabel="Saving">
        Save
      </Button>
    );
  else if (isWaiting)
    action = (
      <Inline gap={8}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading
          loadingLabel="Waiting for sign-in"
        >
          Connect
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={cancel}>
          Cancel
        </Button>
      </Inline>
    );
  else
    action = (
      <Button
        type="button"
        variant={connection && !isProblem ? "outline" : "primary"}
        size="sm"
        onClick={() => authorize({ projectId, serverUrl, serviceId: service.id, personal: true })}
      >
        {connection ? "Reconnect" : "Connect account"}
      </Button>
    );

  return (
    <Item
      variant="outline"
      title={host}
      badge={connection && !problem ? <OAuthStatusBadge status={connection.status} /> : undefined}
      description={
        problem ? (
          <StatusText tone="bad" icon="alert-c">
            {problem}
          </StatusText>
        ) : (
          detail
        )
      }
      actions={action}
    />
  );
};
