import { useEffect, useId, useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { CircleXIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

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
import { TAgentVaultMcpTool } from "@app/hooks/api/agentVault/types";

import { buildListMcpToolsRequest } from "./serviceRequest";
import { MAX_ALLOWED_TOOLS, McpToolScope, toolNameError, TServiceForm } from "./serviceSchema";
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
  serviceId?: string;
  loaded: TLoadedMcpTools | null;
  onLoaded: (loaded: TLoadedMcpTools) => void;
  // The OAuth sign-in from the Credential step expired, so nothing can load until the admin authorizes again.
  isAuthorizationExpired: boolean;
  onGoToCredential: () => void;
};

export const McpToolsFields = ({
  accessBundleId,
  serviceId,
  loaded,
  onLoaded,
  isAuthorizationExpired,
  onGoToCredential
}: Props) => {
  const { control, getValues, setValue, clearErrors, formState } = useFormContext<TServiceForm>();
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
    loaded?.source === source || (isAuthorizationExpired && loaded) ? loaded.tools : null;
  // Each connection is loaded on its own once; after a failure the admin retries from the error.
  const [autoLoadedSource, setAutoLoadedSource] = useState<string | null>(null);

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
  };

  const loadTools = async () => {
    setLoadError(null);
    const request = buildListMcpToolsRequest(accessBundleId, serviceId, getValues());
    // Serialized before the request: field edits mutate nested form values in place.
    const requestSource = JSON.stringify(request);
    // A response for a connection the admin has since changed would replace the current one's list.
    const isCurrent = () => toolsSource(getValues()) === requestSource;
    try {
      const tools = await listTools.mutateAsync(request);
      if (isCurrent()) onLoaded({ source: requestSource, tools });
    } catch (error) {
      if (isCurrent()) {
        setLoadError(serverMessage(error) ?? "The server's tools couldn't be loaded. Try again.");
      }
    }
  };

  useEffect(() => {
    if (
      toolScope !== McpToolScope.Selected ||
      serverTools ||
      isAuthorizationExpired ||
      autoLoadedSource === source
    )
      return;
    setAutoLoadedSource(source);
    loadTools();
  }, [toolScope, serverTools, isAuthorizationExpired, autoLoadedSource, source]);

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
              <FieldLabel htmlFor={`${baseId}-tools`}>Allowed Tools</FieldLabel>
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
                  placeholder="Select tools..."
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
                  <Alert variant="danger">
                    <CircleXIcon />
                    <AlertTitle>Couldn&apos;t load the tools</AlertTitle>
                    <AlertDescription>
                      {loadError} You can still add a tool by typing its name.
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className="mt-2"
                        onClick={loadTools}
                      >
                        <RefreshCwIcon />
                        Try Again
                      </Button>
                    </AlertDescription>
                  </Alert>
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
