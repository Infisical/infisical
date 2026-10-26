import { Controller, useFormContext } from "react-hook-form";

import {
  azureEntraIdCreateFormSchema,
  azureEntraIdEditFormSchema,
  getAzureEntraIdCreateDefaultValues,
  getAzureEntraIdCreatePayload,
  getAzureEntraIdEditDefaultValues,
  getAzureEntraIdEditPayload,
  TAzureEntraIdCreateValues,
  TAzureEntraIdEditValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/azureEntraIdContract";
import { Combobox } from "@app/components/v4/ui/combobox";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { fieldError, ProviderGroup } from "../fields";
import { defineFlowProvider, type DynamicSecretRendererProps } from "../types";

const credentialLabels = {
  tenantId: "Tenant ID",
  applicationId: "Application ID",
  clientSecret: "Client Secret"
} as const;

const credentialPlaceholders = {
  tenantId: "00000000-0000-0000-0000-000000000000",
  applicationId: "00000000-0000-0000-0000-000000000000",
  clientSecret: "Enter client secret"
} as const;

const localUsers = [
  {
    id: "3d6b1f2a-7c4e-4a1b-9f0d-2e8c5a7b1d40",
    name: "Avery Chen",
    email: "avery.chen@example.com"
  },
  {
    id: "8a2e4c6f-1b3d-4f5a-8c7e-9d0b2a4c6e81",
    name: "Jordan Patel",
    email: "jordan.patel@example.com"
  },
  {
    id: "c5f7a9b1-3d5e-4c7a-9b1d-3f5a7c9e1b22",
    name: "Riley Moreno",
    email: "riley.moreno@example.com"
  }
];

const editFields = [
  ["email", "Email", true],
  ["userId", "User ID", true],
  ["tenantId", "Tenant ID", true],
  ["applicationId", "Application ID", false],
  ["clientSecret", "Client Secret", false]
] as const;

function AzureEntraIdEditFields() {
  const { control } = useFormContext<TAzureEntraIdEditValues>();
  return (
    <ProviderGroup id="azure-entra-credentials">
      <div className="grid grid-cols-2 gap-4">
        {editFields.map(([key, label, isReadOnly]) => (
          <Controller
            key={key}
            control={control}
            name={`inputs.${key}`}
            render={({ field, fieldState: { error } }) => (
              <Field wide label={label} error={fieldError(error)}>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  type="password"
                  autoComplete="new-password"
                  readOnly={isReadOnly}
                  invalid={Boolean(error)}
                />
              </Field>
            )}
          />
        ))}
      </div>
    </ProviderGroup>
  );
}

function AzureEntraIdFields({ mode }: Pick<DynamicSecretRendererProps, "mode">) {
  const { control, watch } = useFormContext<TAzureEntraIdCreateValues>();
  const isConfigured = Boolean(
    watch("inputs.tenantId") && watch("inputs.applicationId") && watch("inputs.clientSecret")
  );

  if (mode === "edit") return <AzureEntraIdEditFields />;

  return (
    <ProviderGroup id="azure-entra-configuration">
      <Stack gap={16}>
        {(["tenantId", "applicationId", "clientSecret"] as const).map((key) => (
          <Controller
            key={key}
            control={control}
            name={`inputs.${key}`}
            render={({ field, fieldState: { error } }) => (
              <Field wide label={credentialLabels[key]} error={fieldError(error)}>
                <Input
                  {...field}
                  type={key === "clientSecret" ? "password" : "text"}
                  placeholder={credentialPlaceholders[key]}
                  autoComplete={key === "clientSecret" ? "new-password" : "off"}
                  invalid={Boolean(error)}
                />
              </Field>
            )}
          />
        ))}
        <Controller
          control={control}
          name="selectedUsers"
          render={({ field, fieldState: { error } }) => (
            <Field
              wide
              label="Users"
              description="A unique dynamic secret is created for each selected user. These are local preview options."
              error={fieldError(error)}
            >
              <Combobox
                label="Users"
                multiple
                disabled={!isConfigured}
                invalid={Boolean(error)}
                placeholder="Select users..."
                options={localUsers.map((user) => ({
                  value: user.id,
                  label: `${user.name} (${user.email})`
                }))}
                value={(field.value ?? []).map((user) => user.id)}
                onChange={(ids) =>
                  field.onChange(localUsers.filter((user) => ids.includes(user.id)))
                }
              />
            </Field>
          )}
        />
      </Stack>
    </ProviderGroup>
  );
}

export const azureEntraIdFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.AzureEntraId,
  label: "Azure Entra ID",
  schema: azureEntraIdCreateFormSchema,
  getDefaultValues: getAzureEntraIdCreateDefaultValues,
  toPayload: getAzureEntraIdCreatePayload,
  Renderer: AzureEntraIdFields,
  commonFields: { name: { label: "Secret Prefix" } },
  submitLabel: "Submit",
  edit: {
    schema: azureEntraIdEditFormSchema,
    getDefaultValues: getAzureEntraIdEditDefaultValues,
    toPayload: getAzureEntraIdEditPayload,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});
