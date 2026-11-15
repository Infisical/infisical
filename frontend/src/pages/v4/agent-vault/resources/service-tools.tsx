import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Item } from "@infisical/cipher/ui/item";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Switch } from "@infisical/cipher/ui/switch";
import { StatusText } from "@infisical/cipher/ui/text";

import {
  buildListMcpToolsRequest,
  type TMcpToolsOwnCredential
} from "@app/components/agent-vault/service-sheet/serviceRequest";
import {
  hostOf,
  isMemberProvidedOAuthService,
  MAX_ALLOWED_TOOLS,
  McpToolScope,
  OAUTH_OWN_APP_REQUIRED_ERROR,
  serverUrlOf,
  toolNameError,
  type TServiceForm
} from "@app/components/agent-vault/service-sheet/serviceSchema";
import { AgentVaultCredentialType } from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultMcpTool,
  TAgentVaultService,
  TCreateAgentVaultOauthAuthorizationDTO
} from "@app/hooks/api/agentVault/types";

import { useV4Adapter } from "../../data/adapters";
import { serverMessage, useOAuthAuthorize } from "./oauth";
import type { TServiceFormApi } from "./service-form";

export type TLoadedMcpTools = { source: string; tools: TAgentVaultMcpTool[] };

const NOT_SAVED = "Used once to read the tool list. Infisical doesn't save it.";

const LoadToolsDialog = ({
  projectId,
  service,
  form,
  open,
  loading,
  onOpenChange,
  onLoad,
  onGoToDetails,
  onGoToOwnApp,
  onWaitingChange
}: {
  projectId: string;
  service?: TAgentVaultService;
  form: TServiceForm;
  open: boolean;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onLoad: (own: TMcpToolsOwnCredential) => Promise<string | null>;
  onGoToDetails: () => void;
  onGoToOwnApp: (message?: string) => void;
  onWaitingChange: (isWaiting: boolean) => void;
}) => {
  const trimmedUrl = form.serverUrl.trim();
  const host = hostOf(trimmedUrl);
  const isOAuth = form.credentialType === AgentVaultCredentialType.OAuth;
  const [token, setToken] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async (own: TMcpToolsOwnCredential) => {
    setLoadError(null);
    const error = await onLoad(own);
    if (error) {
      setLoadError(error);
      return;
    }
    setToken("");
    onOpenChange(false);
  };

  const { state, isWaiting, isClientRequired, isOAuthAdvertised, authorize, cancel } =
    useOAuthAuthorize({
      onAuthorized: (authorization) => {
        load({ authorizationId: authorization.id }).catch(() => undefined);
      }
    });

  useEffect(() => {
    onWaitingChange(isWaiting);
  }, [isWaiting, onWaitingChange]);
  useEffect(() => () => onWaitingChange(false), [onWaitingChange]);

  const typedClientId = (form.oauthClientId ?? "").trim();
  const savedClientId =
    service &&
    isMemberProvidedOAuthService(service) &&
    service.credential.type === AgentVaultCredentialType.OAuth
      ? service.credential.clientId
      : null;
  const isSavedClientKept =
    Boolean(savedClientId) && typedClientId === savedClientId && !form.oauthClientSecret;
  const isSecretNeededAgain = isSavedClientKept && serverUrlOf(service) !== trimmedUrl;

  // Only the server holds a saved admin-entered client's secret, so it signs the admin in the way it signs in a
  // member. Otherwise the client on the Credential step is the one the save stores.
  const signInParams = (): TCreateAgentVaultOauthAuthorizationDTO => {
    if (service && isSavedClientKept && !isSecretNeededAgain)
      return { projectId, serverUrl: trimmedUrl, serviceId: service.id, personal: true };
    return {
      projectId,
      serverUrl: trimmedUrl,
      ...(typedClientId
        ? { clientId: typedClientId, clientSecret: form.oauthClientSecret || undefined }
        : {})
    };
  };

  const close = (next: boolean) => {
    if (!next) cancel();
    setToken("");
    setLoadError(null);
    onOpenChange(next);
  };

  const signInProblem = state.status === "failed" ? state.message : loadError;
  const signInDetail = isWaiting ? "Continue in the window that opened." : NOT_SAVED;
  let signInAction: ReactNode;
  if (loading || isWaiting)
    signInAction = (
      <Button
        type="button"
        variant="outline"
        size="sm"
        loading
        loadingLabel={loading ? "Loading tools" : "Waiting for sign-in"}
      >
        Sign in
      </Button>
    );
  else
    signInAction = (
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => {
          setLoadError(null);
          authorize(signInParams());
        }}
      >
        {signInProblem ? "Try again" : "Sign in"}
      </Button>
    );

  const credentialStepAction = (message?: string) => (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={() => {
        close(false);
        onGoToOwnApp(message);
      }}
    >
      Go to Credential step
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent pending={loading}>
        <DialogHeader>
          <DialogTitle>{`Load tools from ${host}`}</DialogTitle>
          <DialogDescription>
            {isOAuth
              ? `Sign in with your ${host} account to load the tools you can pick from.`
              : `Enter a token for ${host} to load the tools you can pick from.`}
          </DialogDescription>
        </DialogHeader>
        {isOAuth ? (
          <Stack gap={12}>
            <Item
              variant="outline"
              title={host}
              description={
                signInProblem ? (
                  <StatusText tone="bad" icon="alert-c">
                    {signInProblem}
                  </StatusText>
                ) : (
                  signInDetail
                )
              }
              actions={signInAction}
            />
            {isSecretNeededAgain && !isClientRequired && !isWaiting && (
              <Alert
                tone="warn"
                actions={credentialStepAction(
                  "The server URL changed, so the saved client secret won't be sent to it. If your OAuth app has a client secret, enter it again. Then go back to the Tools step and load the tools again."
                )}
              >
                The server URL changed, so the saved client secret won&apos;t be sent to it. If your
                OAuth app has a client secret, enter it again on the Credential step, then load the
                tools again.
              </Alert>
            )}
            {isClientRequired && !isWaiting && (
              <Alert
                tone="warn"
                actions={
                  <Inline gap={8}>
                    {!isOAuthAdvertised && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          close(false);
                          onGoToDetails();
                        }}
                      >
                        Go to Details step
                      </Button>
                    )}
                    {credentialStepAction(
                      isOAuthAdvertised
                        ? undefined
                        : `${host} doesn't look like it uses OAuth. If the server does use OAuth, enter your OAuth app's client ID and secret above, then go back to the Tools step and load the tools again.`
                    )}
                  </Inline>
                }
              >
                {isOAuthAdvertised
                  ? `${host} doesn't let Infisical register a client for the sign-in. Enter your OAuth app's client ID on the Credential step, then load the tools again.`
                  : `${host} doesn't look like it uses OAuth. Check the server URL on the Details step. If the server does use OAuth, enter your OAuth app's client ID on the Credential step, then load the tools again.`}
              </Alert>
            )}
          </Stack>
        ) : (
          <Field label="Your token" description={NOT_SAVED} error={loadError ?? undefined}>
            <Input
              type="password"
              value={token}
              maxLength={8192}
              autoComplete="new-password"
              spellCheck={false}
              invalid={Boolean(loadError)}
              onChange={(event) => {
                setToken(event.target.value);
                setLoadError(null);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (token && !loading) load({ token }).catch(() => undefined);
              }}
            />
          </Field>
        )}
        <DialogFooter>
          {isWaiting ? (
            <Button type="button" variant="outline" onClick={cancel}>
              Cancel sign-in
            </Button>
          ) : (
            <Button type="button" variant="ghost" disabled={loading} onClick={() => close(false)}>
              {isOAuth ? "Close" : "Cancel"}
            </Button>
          )}
          {!isOAuth && (
            <Button
              type="button"
              variant="primary"
              disabled={!token}
              loading={loading}
              onClick={() => load({ token }).catch(() => undefined)}
            >
              Load tools
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const McpToolsFields = ({
  projectId,
  service,
  api,
  loaded,
  onLoaded,
  isAuthorizationExpired,
  isCredentialMemberProvided,
  onGoToDetails,
  onGoToCredential,
  onWaitingChange
}: {
  projectId: string;
  service?: TAgentVaultService;
  api: TServiceFormApi;
  loaded: TLoadedMcpTools | null;
  onLoaded: (loaded: TLoadedMcpTools) => void;
  isAuthorizationExpired: boolean;
  isCredentialMemberProvided: boolean;
  onGoToDetails: () => void;
  onGoToCredential: () => void;
  onWaitingChange: (isWaiting: boolean) => void;
}) => {
  const { form, set, err, setErrors } = api;
  const resources = useV4Adapter("agentVaultResources");
  const listTools = resources.useListMcpTools();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const autoLoaded = useRef(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const { toolScope, allowedTools } = form;

  const sourceOf = (data: TServiceForm) =>
    JSON.stringify(buildListMcpToolsRequest(projectId, service?.id, data));
  const source = sourceOf(form);
  // An expired sign-in changes the request, but the list it loaded is still the server's, so it stays on screen.
  const serverTools =
    loaded && (loaded.source === source || (isAuthorizationExpired && !isCredentialMemberProvided))
      ? loaded.tools
      : null;

  const savedTools = useMemo(
    () => (service && "allowedTools" in service ? (service.allowedTools ?? []) : []),
    [service]
  );
  const options = useMemo(() => {
    const listed = serverTools ?? [];
    const listedNames = new Set(listed.map((tool) => tool.name));
    const unlisted = [...new Set([...savedTools, ...allowedTools])]
      .filter((name) => !listedNames.has(name))
      .map((name) => ({
        value: name,
        label: name,
        meta: serverTools ? "Custom" : undefined
      }));
    return [
      ...unlisted,
      ...listed.map((tool) => ({
        value: tool.name,
        label: tool.name,
        description: tool.description ?? undefined
      }))
    ];
  }, [serverTools, savedTools, allowedTools]);
  const isAtLimit = allowedTools.length >= MAX_ALLOWED_TOOLS;

  const setAllowedTools = (next: string[]) => {
    set("allowedTools", next.slice(0, MAX_ALLOWED_TOOLS));
    setLoadError(null);
    setNameError(null);
  };

  const loadTools = async (own?: TMcpToolsOwnCredential): Promise<string | null> => {
    setLoadError(null);
    const requestSource = source;
    setLoading(true);
    try {
      const tools = await listTools.mutateAsync(
        buildListMcpToolsRequest(projectId, service?.id, form, own)
      );
      onLoaded({ source: requestSource, tools });
      return null;
    } catch (error) {
      const message = serverMessage(error) ?? "The server's tools couldn't be loaded. Try again.";
      if (!own) setLoadError(message);
      return message;
    } finally {
      setLoading(false);
    }
  };

  const goToOwnApp = (message?: string) => {
    const host = hostOf(form.serverUrl.trim());
    setErrors((current) => ({
      ...current,
      [OAUTH_OWN_APP_REQUIRED_ERROR]: "true",
      oauthAuthorizationId:
        message ??
        `${host} doesn't let Infisical register as an OAuth client. Enter the client ID (and secret, if it has one) of your own OAuth app, which every member then signs in with. Then go back to the Tools step and load the tools again.`
    }));
    onGoToCredential();
  };

  const canAutoLoad =
    !serverTools && !isAuthorizationExpired && !isCredentialMemberProvided && !autoLoaded.current;
  const autoLoad = () => {
    if (!canAutoLoad) return;
    autoLoaded.current = true;
    loadTools().catch(() => undefined);
  };

  useEffect(() => {
    if (toolScope === McpToolScope.Selected) autoLoad();
  }, []);

  const loadLabel = serverTools ? "Reload tools" : "Load tools";

  return (
    <Stack gap={16}>
      <Switch
        label="All tools"
        description="Agents can call every tool the server offers, including ones it adds later. Turn this off to pick the tools agents can call."
        checked={toolScope === McpToolScope.All}
        onChange={(checked) => {
          set("toolScope", checked ? McpToolScope.All : McpToolScope.Selected);
          if (!checked) autoLoad();
        }}
      />
      {toolScope === McpToolScope.Selected && (
        <Stack gap={8}>
          <Field
            label="Allowed tools"
            help={
              <Button
                type="button"
                variant="outline"
                size="xs"
                icon="sync"
                disabled={
                  isCredentialMemberProvided ? !form.serverUrl.trim() : isAuthorizationExpired
                }
                loading={loading && !dialogOpen}
                onClick={() => {
                  if (isCredentialMemberProvided) setDialogOpen(true);
                  else loadTools().catch(() => undefined);
                }}
              >
                {loadLabel}
              </Button>
            }
            error={
              err("allowedTools") ??
              nameError ??
              (loadError && !isAuthorizationExpired
                ? `${loadError} You can still add a tool by typing its name.`
                : undefined)
            }
          >
            <Combobox
              multiple
              mono
              label="Allowed tools"
              options={options}
              value={allowedTools}
              invalid={Boolean(err("allowedTools"))}
              placeholder={serverTools ? "Select tools" : "Select tools, or type a tool's name"}
              emptyText={
                serverTools ? "No tools match your search" : "Type a tool's name to add it"
              }
              clearable
              clearLabel="Clear all tools"
              createLabel={(query) => `Add ${query}`}
              onCreate={
                isAtLimit
                  ? undefined
                  : (query) => {
                      const problem = toolNameError(query);
                      setNameError(problem);
                      if (problem) return;
                      if (allowedTools.some((name) => name.toLowerCase() === query.toLowerCase()))
                        return;
                      setAllowedTools([...allowedTools, query]);
                    }
              }
              onChange={setAllowedTools}
            />
          </Field>
          {isAuthorizationExpired && (
            <Alert
              tone="warn"
              title="The authorization expired"
              actions={
                <Button type="button" variant="outline" size="xs" onClick={onGoToCredential}>
                  Go to Credential step
                </Button>
              }
            >
              Authorize again on the Credential step to reload the tools. Your selection is kept.
            </Alert>
          )}
        </Stack>
      )}
      {isCredentialMemberProvided && (
        <LoadToolsDialog
          projectId={projectId}
          service={service}
          form={form}
          open={dialogOpen}
          loading={loading}
          onOpenChange={setDialogOpen}
          onLoad={loadTools}
          onGoToDetails={onGoToDetails}
          onGoToOwnApp={goToOwnApp}
          onWaitingChange={onWaitingChange}
        />
      )}
    </Stack>
  );
};
