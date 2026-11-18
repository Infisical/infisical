import { useId, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel
} from "@app/components/v3";
import {
  ProjectPermissionAgentVaultVariableActions,
  ProjectPermissionSub,
  useProjectPermission
} from "@app/context";
import { useDebounce } from "@app/hooks";
import {
  AgentVaultOauthStatus,
  AgentVaultVariableScope,
  AgentVaultVariableType,
  useListAgentVaultVariables
} from "@app/hooks/api/agentVault";
import { TAgentVaultService, TAgentVaultVariable } from "@app/hooks/api/agentVault/types";

import { useOAuthVariableCreation } from "../useOAuthVariableCreation";
import { OAuthStatusBadge } from "./OAuthAuthorizeCard";
import { storedOAuthVariableKey, TServiceForm } from "./serviceSchema";

type TOption = { key: string; status?: AgentVaultOauthStatus };

const toOption = (variable: TAgentVaultVariable): TOption => ({
  key: variable.key,
  status: variable.oauth?.status
});

type Props = {
  projectId: string;
  service?: TAgentVaultService | null;
};

/** Picks the OAuth variable whose sign-in a service uses as its credential, or creates one. */
export const OAuthVariableField = ({ projectId, service }: Props) => {
  const { control, setValue, clearErrors } = useFormContext<TServiceForm>();
  const { permission } = useProjectPermission();
  const inputId = useId();
  // Choosing one names a variable whose sign-in the service then sends, which the API treats as reading its value.
  const canList =
    permission.can(
      ProjectPermissionAgentVaultVariableActions.Read,
      ProjectPermissionSub.AgentVaultVariables
    ) &&
    permission.can(
      ProjectPermissionAgentVaultVariableActions.ReadValue,
      ProjectPermissionSub.AgentVaultVariables
    );
  const canCreate =
    canList &&
    permission.can(
      ProjectPermissionAgentVaultVariableActions.Create,
      ProjectPermissionSub.AgentVaultVariables
    );

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 200);
  const { data, isPending, isError } = useListAgentVaultVariables(
    projectId,
    {
      scope: AgentVaultVariableScope.Global,
      type: AgentVaultVariableType.OAuth,
      search: debouncedSearch.trim() || undefined,
      limit: 100
    },
    { enabled: canList }
  );
  const options = (data?.variables ?? []).map(toOption);

  const selectVariable = (variable: TAgentVaultVariable) => {
    setValue("oauthVariableKey", variable.key, { shouldDirty: true, shouldValidate: true });
  };
  const creation = useOAuthVariableCreation<TOption>(canCreate, selectVariable);

  const storedKey = storedOAuthVariableKey(service);

  return (
    <Controller
      control={control}
      name="oauthVariableKey"
      render={({ field, fieldState }) => {
        const selected = field.value
          ? (options.find((option) => option.key === field.value) ?? { key: field.value })
          : null;
        return (
          <Field>
            <FieldLabel htmlFor={inputId}>OAuth Variable</FieldLabel>
            <FieldContent>
              <Combobox
                id={inputId}
                modal
                isClearable={false}
                isDisabled={!canList}
                isLoading={canList && (isPending || search !== debouncedSearch)}
                isError={Boolean(fieldState.error)}
                value={selected}
                onValueChange={(option) => {
                  field.onChange(option.key);
                  clearErrors("oauthVariableKey");
                }}
                options={options}
                includeMissingSelectedOptions
                onSearchChange={setSearch}
                placeholder="Select an OAuth variable..."
                emptyMessage={
                  isError
                    ? "Could not load OAuth variables. Close this panel and open it again to retry."
                    : "No OAuth variables found."
                }
                getOptionLabel={(option) => option.key}
                getOptionValue={(option) => option.key}
                renderOption={(option) => (
                  <div className="flex w-full min-w-0 items-center justify-between gap-2">
                    <span className="truncate font-mono text-sm">{option.key}</span>
                    {option.status && option.status !== AgentVaultOauthStatus.Connected && (
                      <OAuthStatusBadge status={option.status} />
                    )}
                  </div>
                )}
                creation={isError ? undefined : creation}
              />
              {!canList && (
                <FieldDescription>
                  {storedKey
                    ? "Changing it takes permission to read variables and their values."
                    : "Choosing one takes permission to read variables and their values."}
                </FieldDescription>
              )}
              {canList &&
                (selected?.status && selected.status !== AgentVaultOauthStatus.Connected ? (
                  <FieldDescription>
                    Agents can&apos;t use this service until{" "}
                    <code className="font-mono">{selected.key}</code> is authorized on the Variables
                    page.
                  </FieldDescription>
                ) : (
                  <FieldDescription>
                    The service sends the variable&apos;s access token, and refreshes it when it
                    expires.
                  </FieldDescription>
                ))}
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        );
      }}
    />
  );
};
