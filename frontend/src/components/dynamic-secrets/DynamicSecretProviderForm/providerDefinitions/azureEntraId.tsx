import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldError,
  FieldFeedback,
  FieldLabel,
  FilterableSelect,
  Input
} from "@app/components/v3";
import { SecretInput } from "@app/components/v3/platform";
import { useGetDynamicSecretProviderData } from "@app/hooks/api/dynamicSecret/queries";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { defineDynamicSecretProvider, TDynamicSecretProviderRendererProps } from "../types";
import {
  AZURE_ENTRA_ID_CREATE_RENDERER_REASONS,
  AZURE_ENTRA_ID_EDIT_RENDERER_REASONS,
  azureEntraIdCreateFormSchema,
  azureEntraIdEditFormSchema,
  getAzureEntraIdCreateDefaultValues,
  getAzureEntraIdCreatePayload,
  getAzureEntraIdEditDefaultValues,
  getAzureEntraIdEditPayload,
  TAzureEntraIdCreateValues,
  TAzureEntraIdEditValues
} from "./azureEntraIdContract";

const credentialLabels = {
  tenantId: "Tenant ID",
  applicationId: "Application ID",
  clientSecret: "Client Secret"
} as const;

const EMPTY_USERS: { id: string; name: string; email: string }[] = [];

const AzureEntraIdFields = ({
  context,
  mode,
  setSubmitState
}: TDynamicSecretProviderRendererProps) => {
  const { control, watch } = useFormContext<TAzureEntraIdCreateValues & TAzureEntraIdEditValues>();
  const tenantId = watch("inputs.tenantId");
  const applicationId = watch("inputs.applicationId");
  const clientSecret = watch("inputs.clientSecret");
  const isConfigured = Boolean(tenantId && applicationId && clientSecret);
  const usersQuery = useGetDynamicSecretProviderData({
    projectSlug: context.projectSlug,
    tenantId,
    applicationId,
    clientSecret,
    enabled: mode === "create" && isConfigured
  });
  const isLoading = mode === "create" && isConfigured && usersQuery.isFetching;
  const isError = mode === "create" && isConfigured && !usersQuery.isFetching && usersQuery.isError;

  useEffect(() => {
    setSubmitState({
      isDisabled: mode === "create" && (isLoading || isError),
      isPending: isLoading
    });
  }, [isError, isLoading, mode, setSubmitState]);

  if (mode === "edit") {
    const fields = [
      ["email", "Email", true],
      ["userId", "User ID", true],
      ["tenantId", "Tenant ID", true],
      ["applicationId", "Application ID", false],
      ["clientSecret", "Client Secret", false]
    ] as const;
    return (
      <DynamicSecretProviderGroup id="azure-entra-credentials" presentation="panel">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map(([key, label, isReadOnly]) => (
            <Controller
              key={key}
              control={control}
              name={`inputs.${key}`}
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor={`azure-entra-${key}`}>{label}</FieldLabel>
                  <SecretInput
                    {...field}
                    id={`azure-entra-${key}`}
                    isReadOnly={isReadOnly}
                    aria-describedby={error ? `azure-entra-${key}-error` : undefined}
                  />
                  <FieldError id={`azure-entra-${key}-error`}>{error?.message}</FieldError>
                </Field>
              )}
            />
          ))}
        </div>
      </DynamicSecretProviderGroup>
    );
  }

  return (
    <DynamicSecretProviderGroup id="azure-entra-configuration" presentation="panel">
      <div className="flex flex-col gap-4">
        {(["tenantId", "applicationId", "clientSecret"] as const).map((key) => (
          <Controller
            key={key}
            control={control}
            name={`inputs.${key}`}
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor={`azure-entra-${key}`}>{credentialLabels[key]}</FieldLabel>
                <Input
                  {...field}
                  id={`azure-entra-${key}`}
                  type={key === "clientSecret" ? "password" : "text"}
                  autoComplete={key === "clientSecret" ? "new-password" : "off"}
                  isError={Boolean(error)}
                  aria-describedby={error ? `azure-entra-${key}-error` : undefined}
                />
                <FieldError id={`azure-entra-${key}-error`}>{error?.message}</FieldError>
              </Field>
            )}
          />
        ))}
        <Controller
          control={control}
          name="selectedUsers"
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="azure-entra-users">Users</FieldLabel>
              <FilterableSelect
                inputId="azure-entra-users"
                isMulti
                isDisabled={!isConfigured || isLoading || isError}
                isLoading={isLoading}
                options={usersQuery.data ?? EMPTY_USERS}
                value={field.value ?? EMPTY_USERS}
                onBlur={field.onBlur}
                onChange={(next) => field.onChange(next ?? EMPTY_USERS)}
                getOptionLabel={(user) => `${user.name} (${user.email})`}
                getOptionValue={(user) => user.id}
                placeholder="Select users..."
                isError={Boolean(error)}
                aria-describedby="azure-entra-users-feedback"
              />
              <FieldFeedback
                id="azure-entra-users-feedback"
                description="A unique dynamic secret is created for each selected user."
                error={error?.message}
              />
            </Field>
          )}
        />
      </div>
    </DynamicSecretProviderGroup>
  );
};

export const azureEntraIdDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.AzureEntraId,
  label: "Azure Entra ID",
  create: {
    schema: azureEntraIdCreateFormSchema,
    getDefaultValues: getAzureEntraIdCreateDefaultValues,
    toPayload: getAzureEntraIdCreatePayload,
    customRenderer: {
      reasons: AZURE_ENTRA_ID_CREATE_RENDERER_REASONS,
      Component: AzureEntraIdFields
    },
    commonFields: { name: { label: "Secret Prefix" } },
    submitLabel: "Submit"
  },
  edit: {
    schema: azureEntraIdEditFormSchema,
    getDefaultValues: getAzureEntraIdEditDefaultValues,
    toPayload: getAzureEntraIdEditPayload,
    customRenderer: {
      reasons: AZURE_ENTRA_ID_EDIT_RENDERER_REASONS,
      Component: AzureEntraIdFields
    },
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});
