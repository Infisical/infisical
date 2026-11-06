import { useEffect, useId, useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  Toggle
} from "@app/components/v3";
import { useListAgentVaultMcpTools } from "@app/hooks/api/agentVault";
import { TAgentVaultMcpTool, TAgentVaultService } from "@app/hooks/api/agentVault/types";

import { McpToolsLoadButton } from "./McpToolsLoadButton";
import { buildListMcpToolsRequest, TMcpToolsOwnCredential } from "./serviceRequest";
import {
  hostOf,
  MAX_ALLOWED_TOOLS,
  McpToolScope,
  OAUTH_OWN_APP_REQUIRED_ERROR,
  toolNameError,
  TServiceForm
} from "./serviceSchema";
import { serverMessage } from "./useOAuthAuthorize";

/**
 * A loaded list belongs to the request that loaded it, so a changed URL, transport, credential or custom
 * header needs a new load.
 */
export type TLoadedMcpTools = { source: string; tools: TAgentVaultMcpTool[] };

type TToolOption = { name: string; description: string | null; isUnlisted: boolean };

const formatAddLabel = (inputValue: string) => (
  <>
    Add <span className="font-mono">{inputValue}</span>
  </>
);

type Props = {
  accessBundleId: string;
  service?: TAgentVaultService | null;
  loaded: TLoadedMcpTools | null;
  onLoaded: (loaded: TLoadedMcpTools) => void;
  // The OAuth sign-in from the Credential step expired, so nothing can load until the admin authorizes again.
  isAuthorizationExpired: boolean;
  // Each member provides the credential, so Infisical has none of its own to list the tools with.
  isCredentialMemberProvided: boolean;
  onGoToDetails: () => void;
  onGoToCredential: () => void;
  onSignInChange?: (isSigningIn: boolean) => void;
};

export const McpToolsFields = ({
  accessBundleId,
  service,
  loaded,
  onLoaded,
  isAuthorizationExpired,
  isCredentialMemberProvided,
  onGoToDetails,
  onGoToCredential,
  onSignInChange
}: Props) => {
  const serviceId = service?.id;
  const { control, getValues, setValue, setError, clearErrors, formState } =
    useFormContext<TServiceForm>();
  const form = useWatch({ control }) as TServiceForm;
  const { toolScope, allowedTools } = form;
  const listTools = useListAgentVaultMcpTools();
  const [loadError, setLoadError] = useState<string | null>(null);
  const baseId = useId();

  const toolsSource = (data: TServiceForm) =>
    JSON.stringify(buildListMcpToolsRequest(accessBundleId, serviceId, data));
  const source = toolsSource(form);
  // An expired sign-in changes the request, but the list it loaded is still the server's, so it stays on screen.
  const serverTools =
    loaded && (loaded.source === source || (isAuthorizationExpired && !isCredentialMemberProvided))
      ? loaded.tools
      : null;
  // Each connection is loaded on its own once; after a failure the admin reloads with the button.
  const [autoLoadedSource, setAutoLoadedSource] = useState<string | null>(null);

  // An error from the other credential's load says nothing about this one.
  useEffect(() => {
    setLoadError(null);
  }, [isCredentialMemberProvided]);

  const options = useMemo<TToolOption[]>(() => {
    const listed = serverTools ?? [];
    const listedNames = new Set(listed.map((tool) => tool.name));
    // First, so a saved tool the server dropped is the first thing the admin sees.
    const savedNames = (formState.defaultValues?.allowedTools ?? []).filter(
      (name): name is string => Boolean(name)
    );
    const unlisted = [...new Set([...savedNames, ...allowedTools])]
      .filter((name) => !listedNames.has(name))
      .map((name) => ({ name, description: null, isUnlisted: serverTools !== null }));
    return [...unlisted, ...listed.map((tool) => ({ ...tool, isUnlisted: false }))];
  }, [serverTools, allowedTools, formState.defaultValues]);

  const optionByName = useMemo(
    () => new Map(options.map((option) => [option.name, option])),
    [options]
  );
  const selectedOptions = allowedTools.map(
    (name) => optionByName.get(name) ?? { name, description: null, isUnlisted: false }
  );
  const selectedNames = new Set(allowedTools);
  const isAtLimit = allowedTools.length >= MAX_ALLOWED_TOOLS;

  const setAllowedTools = (next: string[]) => {
    setValue("allowedTools", next, { shouldDirty: true });
    clearErrors("allowedTools");
    // Typing names is the way past a failed load, so its error is stale now.
    setLoadError(null);
  };

  // An own credential is left out of the source: it is used once, and the list it loads is the server's. Its failure
  // is shown in the dialog it was entered in, so it is only returned.
  const loadTools = async (own?: TMcpToolsOwnCredential): Promise<string | null> => {
    setLoadError(null);
    const request = buildListMcpToolsRequest(accessBundleId, serviceId, getValues(), own);
    // Serialized before the request: field edits mutate nested form values in place.
    const requestSource = toolsSource(getValues());
    // A response for a connection the admin has since changed would replace the current one's list.
    const isCurrent = () => toolsSource(getValues()) === requestSource;
    try {
      const tools = await listTools.mutateAsync(request);
      if (isCurrent()) onLoaded({ source: requestSource, tools });
      return null;
    } catch (error) {
      const message = serverMessage(error) ?? "The server's tools couldn't be loaded. Try again.";
      if (isCurrent() && !own) setLoadError(message);
      return message;
    }
  };

  // Opens the client fields on the Credential step, as a save the server refuses for the same reason does.
  const goToOwnApp = (message?: string) => {
    const host = hostOf(getValues("serverUrl").trim());
    setError("oauthAuthorizationId", {
      type: OAUTH_OWN_APP_REQUIRED_ERROR,
      message:
        message ??
        `${host} doesn't let Infisical register as an OAuth client. Enter the client ID (and secret, if it has one) of your own OAuth app, which every member then signs in with. Then go back to the Tools step and load the tools again.`
    });
    onGoToCredential();
  };

  const loadLabel = serverTools ? "Reload Tools" : "Load Tools";

  useEffect(() => {
    if (
      toolScope !== McpToolScope.Selected ||
      serverTools ||
      isAuthorizationExpired ||
      isCredentialMemberProvided ||
      autoLoadedSource === source
    )
      return;
    setAutoLoadedSource(source);
    loadTools().catch(() => undefined);
  }, [
    toolScope,
    serverTools,
    isAuthorizationExpired,
    isCredentialMemberProvided,
    autoLoadedSource,
    source
  ]);

  return (
    <div className="flex flex-col gap-5">
      <Controller
        control={control}
        name="toolScope"
        render={({ field }) => (
          <Field orientation="horizontal" className="rounded-md border border-border p-4">
            <FieldContent>
              <FieldTitle>All Tools</FieldTitle>
              <FieldDescription>
                Agents can call every tool the server offers, including ones it adds later. Turn
                this off to pick the tools agents can call.
              </FieldDescription>
            </FieldContent>
            <Toggle
              id={`${baseId}-all-tools`}
              variant="av"
              checked={field.value === McpToolScope.All}
              onCheckedChange={(checked) =>
                field.onChange(checked ? McpToolScope.All : McpToolScope.Selected)
              }
            />
          </Field>
        )}
      />

      {toolScope === McpToolScope.Selected && (
        <Controller
          control={control}
          name="allowedTools"
          render={({ fieldState }) => (
            <Field>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor={`${baseId}-tools`}>Allowed Tools</FieldLabel>
                {isCredentialMemberProvided ? (
                  <McpToolsLoadButton
                    accessBundleId={accessBundleId}
                    service={service}
                    label={loadLabel}
                    isLoading={listTools.isPending}
                    onLoad={loadTools}
                    onGoToDetails={onGoToDetails}
                    onGoToOwnApp={goToOwnApp}
                    onSignInChange={onSignInChange}
                  />
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    isDisabled={isAuthorizationExpired || listTools.isPending}
                    isPending={listTools.isPending}
                    onClick={() => loadTools().catch(() => undefined)}
                  >
                    <RefreshCwIcon />
                    {loadLabel}
                  </Button>
                )}
              </div>
              <FieldContent className="gap-3">
                <Combobox
                  id={`${baseId}-tools`}
                  multiple
                  modal
                  isError={Boolean(fieldState.error)}
                  isLoading={listTools.isPending}
                  options={options}
                  value={selectedOptions}
                  onValueChange={(next) => setAllowedTools(next.map((option) => option.name))}
                  getOptionValue={(option) => option.name}
                  getOptionLabel={(option) => option.name}
                  isOptionDisabled={(option) => isAtLimit && !selectedNames.has(option.name)}
                  includeMissingSelectedOptions
                  renderOption={(option) => (
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-mono">{option.name}</span>
                        {option.isUnlisted && <Badge variant="neutral">Custom</Badge>}
                      </span>
                      {option.description && (
                        <span className="truncate text-xs text-muted" title={option.description}>
                          {option.description}
                        </span>
                      )}
                    </span>
                  )}
                  placeholder={
                    serverTools ? "Select tools..." : "Select tools, or type a tool's name..."
                  }
                  searchPlaceholder="Search or add a tool..."
                  searchAriaLabel="Search tools"
                  clearAriaLabel="Clear all tools"
                  emptyMessage={(inputValue) =>
                    (inputValue && toolNameError(inputValue.trim())) ||
                    (serverTools ? "No tools match your search." : "Type a tool's name to add it.")
                  }
                  creation={{
                    isDisabled: isAtLimit,
                    emptyLabel: "Type a tool's exact name to add it",
                    isValid: (inputValue) => !toolNameError(inputValue),
                    // The proxy matches names exactly, so a name differing only in case from a listed tool
                    // is almost certainly a typo for it.
                    isDuplicate: (inputValue, option) =>
                      option.name.toLowerCase() === inputValue.toLowerCase(),
                    formatLabel: formatAddLabel,
                    onCreate: (inputValue) => setAllowedTools([...allowedTools, inputValue])
                  }}
                />

                {isAuthorizationExpired && (
                  <Alert variant="warning">
                    <TriangleAlertIcon />
                    <AlertTitle>The authorization expired</AlertTitle>
                    <AlertDescription>
                      Authorize again on the Credential step to reload the tools. Your selection is
                      kept.
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className="mt-2"
                        onClick={onGoToCredential}
                      >
                        Go to Credential Step
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {loadError && !isAuthorizationExpired && (
                  <FieldError>{loadError} You can still add a tool by typing its name.</FieldError>
                )}
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
      )}
    </div>
  );
};
