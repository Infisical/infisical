import { Controller, useFormContext } from "react-hook-form";

import {
  getIbmApiConnectCreateDefaultValues,
  getIbmApiConnectCreatePayload,
  getIbmApiConnectEditDefaultValues,
  getIbmApiConnectEditPayload,
  ibmApiConnectCreateFormSchema,
  ibmApiConnectEditFormSchema,
  normalizeIbmApiConnectGatewayValueForMode,
  type TIbmApiConnectFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/ibmApiConnectContract";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { Combobox } from "@app/components/v4/ui/combobox";
import { Field } from "@app/components/v4/ui/field";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { fieldError, GatewayPicker, ProviderFields, ProviderGroup } from "../fields";
import { defineFlowProvider, type DynamicSecretRendererProps } from "../types";

type LocalOption = { id: string; name: string; title?: string };

const LOCAL_PREVIEW_DESCRIPTION = "Local preview options. No IBM API Connect request is made.";

const localOrganizations: LocalOption[] = [
  { id: "local-org-acme", name: "acme", title: "Acme Corp" },
  { id: "local-org-sandbox", name: "sandbox", title: "Sandbox" }
];

const localCatalogs: Record<string, LocalOption[]> = {
  "local-org-acme": [
    { id: "local-catalog-production", name: "production", title: "Production" },
    { id: "local-catalog-staging", name: "staging", title: "Staging" }
  ],
  "local-org-sandbox": [{ id: "local-catalog-sandbox", name: "sandbox", title: "Sandbox" }]
};

const localApplications: Record<string, (LocalOption & { consumerOrgId: string })[]> = {
  "local-catalog-production": [
    {
      id: "local-app-payments",
      name: "payments",
      title: "Payments API Client",
      consumerOrgId: "local-consumer-org-payments"
    },
    {
      id: "local-app-mobile",
      name: "mobile",
      title: "Mobile App",
      consumerOrgId: "local-consumer-org-mobile"
    }
  ],
  "local-catalog-staging": [
    {
      id: "local-app-qa",
      name: "qa",
      title: "QA Client",
      consumerOrgId: "local-consumer-org-qa"
    }
  ],
  "local-catalog-sandbox": [
    {
      id: "local-app-demo",
      name: "demo",
      consumerOrgId: "local-consumer-org-demo"
    }
  ]
};

const toComboboxOptions = (options: readonly LocalOption[]) =>
  options.map((option) => ({ value: option.id, label: option.title || option.name }));

const credentialFields = [
  {
    name: "inputs.instanceUrl",
    type: "text",
    label: "Instance URL",
    placeholder: "https://api-manager.example.com"
  },
  {
    name: "inputs.apiKey",
    type: "secret",
    label: "API Key",
    placeholder: "Enter API key",
    autoComplete: "new-password"
  },
  {
    name: "inputs.clientId",
    type: "text",
    label: "Client ID",
    placeholder: "Enter client ID",
    layout: "half"
  },
  {
    name: "inputs.clientSecret",
    type: "secret",
    label: "Client Secret",
    placeholder: "Enter client secret",
    autoComplete: "new-password",
    layout: "half"
  }
] satisfies readonly TDynamicSecretProviderField<TIbmApiConnectFormValues>[];

function IbmApiConnectFields({ mode }: Pick<DynamicSecretRendererProps, "mode">) {
  const { control, setValue, watch } = useFormContext<TIbmApiConnectFormValues>();
  const instanceUrl = watch("inputs.instanceUrl");
  const apiKey = watch("inputs.apiKey");
  const clientId = watch("inputs.clientId");
  const clientSecret = watch("inputs.clientSecret");
  const orgId = watch("inputs.orgId");
  const catalogId = watch("inputs.catalogId");
  const gatewayId = watch("inputs.gatewayId");
  const gatewayPoolId = watch("inputs.gatewayPoolId");
  const credentialsComplete = Boolean(instanceUrl && apiKey && clientId && clientSecret);
  const orgSelected = credentialsComplete && Boolean(orgId);
  const catalogSelected = orgSelected && Boolean(catalogId);

  const organizations = credentialsComplete ? localOrganizations : [];
  const selectedOrg = organizations.find((organization) => organization.id === orgId);
  const catalogs = orgSelected && selectedOrg ? (localCatalogs[selectedOrg.id] ?? []) : [];
  const selectedCatalog = catalogs.find((catalog) => catalog.id === catalogId);
  const applications =
    catalogSelected && selectedCatalog ? (localApplications[selectedCatalog.id] ?? []) : [];

  return (
    <>
      <ProviderGroup id="ibm-api-connect-connection">
        <Field wide label="Gateway">
          <GatewayPicker
            value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
            onChange={({ gatewayId: nextId, gatewayPoolId: nextPoolId }) => {
              setValue(
                "inputs.gatewayId",
                normalizeIbmApiConnectGatewayValueForMode(mode, nextId),
                { shouldDirty: true }
              );
              setValue(
                "inputs.gatewayPoolId",
                normalizeIbmApiConnectGatewayValueForMode(mode, nextPoolId),
                { shouldDirty: true }
              );
            }}
          />
        </Field>
        <ProviderFields fields={credentialFields} />
      </ProviderGroup>

      <ProviderGroup
        id="ibm-api-connect-remote"
        surface
        title="Organization, Catalog & Application"
      >
        <Controller
          control={control}
          name="inputs.orgId"
          render={({ field, fieldState: { error } }) => (
            <Field
              wide
              label="Organization"
              description={
                credentialsComplete
                  ? LOCAL_PREVIEW_DESCRIPTION
                  : "Fill in all credentials above first."
              }
              error={fieldError(error)}
            >
              <Combobox
                label="Organization"
                disabled={!credentialsComplete}
                invalid={Boolean(error)}
                options={toComboboxOptions(organizations)}
                value={organizations.find((option) => option.id === field.value)?.id ?? ""}
                onChange={(next) => {
                  field.onChange(next);
                  setValue("inputs.catalogId", "");
                  setValue("inputs.consumerOrgId", "");
                  setValue("inputs.appId", "");
                }}
                placeholder="Select an organization..."
              />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="inputs.catalogId"
          render={({ field, fieldState: { error } }) => (
            <Field
              wide
              label="Catalog"
              description={
                orgSelected ? LOCAL_PREVIEW_DESCRIPTION : "Select an organization first."
              }
              error={fieldError(error)}
            >
              <Combobox
                label="Catalog"
                disabled={!orgSelected}
                invalid={Boolean(error)}
                options={toComboboxOptions(catalogs)}
                value={catalogs.find((option) => option.id === field.value)?.id ?? ""}
                onChange={(next) => {
                  field.onChange(next);
                  setValue("inputs.consumerOrgId", "");
                  setValue("inputs.appId", "");
                }}
                placeholder="Select a catalog..."
              />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="inputs.appId"
          render={({ field, fieldState: { error } }) => (
            <Field
              wide
              label="Application"
              description={catalogSelected ? LOCAL_PREVIEW_DESCRIPTION : "Select a catalog first."}
              error={fieldError(error)}
            >
              <Combobox
                label="Application"
                disabled={!catalogSelected}
                invalid={Boolean(error)}
                options={toComboboxOptions(applications)}
                value={applications.find((option) => option.id === field.value)?.id ?? ""}
                onChange={(next) => {
                  field.onChange(next);
                  setValue(
                    "inputs.consumerOrgId",
                    applications.find((option) => option.id === next)?.consumerOrgId ?? ""
                  );
                }}
                placeholder="Select an application..."
              />
            </Field>
          )}
        />
      </ProviderGroup>
    </>
  );
}

export const ibmApiConnectFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.IbmApiConnect,
  label: "IBM API Connect",
  schema: ibmApiConnectCreateFormSchema,
  getDefaultValues: getIbmApiConnectCreateDefaultValues,
  toPayload: getIbmApiConnectCreatePayload,
  Renderer: IbmApiConnectFields,
  submitLabel: "Submit",
  edit: {
    schema: ibmApiConnectEditFormSchema,
    getDefaultValues: getIbmApiConnectEditDefaultValues,
    toPayload: getIbmApiConnectEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
