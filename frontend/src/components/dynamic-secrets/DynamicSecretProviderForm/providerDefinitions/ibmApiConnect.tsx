import { Controller, useFormContext } from "react-hook-form";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Field,
  FieldDescription,
  FieldFeedback,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  useGetIbmApiConnectOrgApps,
  useGetIbmApiConnectOrgCatalogs,
  useGetIbmApiConnectOrgs
} from "@app/hooks/api/dynamicSecret/queries";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { defineDynamicSecretProvider, TDynamicSecretProviderField } from "../types";
import {
  getIbmApiConnectCreateDefaultValues,
  getIbmApiConnectCreatePayload,
  getIbmApiConnectEditDefaultValues,
  getIbmApiConnectEditPayload,
  ibmApiConnectCreateFormSchema,
  ibmApiConnectEditFormSchema,
  TIbmApiConnectFormValues
} from "./ibmApiConnectContract";

const credentialFields = [
  { name: "inputs.instanceUrl", type: "text", label: "Instance URL" },
  { name: "inputs.apiKey", type: "secret", label: "API Key", autoComplete: "new-password" },
  { name: "inputs.clientId", type: "text", label: "Client ID", layout: "half" },
  {
    name: "inputs.clientSecret",
    type: "secret",
    label: "Client Secret",
    autoComplete: "new-password",
    layout: "half"
  }
] satisfies readonly TDynamicSecretProviderField<TIbmApiConnectFormValues>[];

const getSingleOption = <T,>(selection: T | readonly T[] | null): T | null =>
  Array.isArray(selection) ? null : (selection as T | null);

const IbmApiConnectFields = () => {
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

  const orgsQuery = useGetIbmApiConnectOrgs({
    instanceUrl: instanceUrl || "",
    apiKey: apiKey || "",
    clientId: clientId || "",
    clientSecret: clientSecret || "",
    enabled: credentialsComplete
  });
  const selectedOrg = orgsQuery.data?.find((organization) => organization.id === orgId);
  const catalogsQuery = useGetIbmApiConnectOrgCatalogs({
    instanceUrl: instanceUrl || "",
    apiKey: apiKey || "",
    clientId: clientId || "",
    clientSecret: clientSecret || "",
    orgId: selectedOrg?.id || "",
    enabled: orgSelected
  });
  const selectedCatalog = catalogsQuery.data?.find((catalog) => catalog.id === catalogId);
  const appsQuery = useGetIbmApiConnectOrgApps({
    instanceUrl: instanceUrl || "",
    apiKey: apiKey || "",
    clientId: clientId || "",
    clientSecret: clientSecret || "",
    orgId: selectedOrg?.id || "",
    catalogId: selectedCatalog?.id || "",
    enabled: catalogSelected
  });

  return (
    <>
      <DynamicSecretProviderGroup id="ibm-api-connect-connection" presentation="panel">
        <OrgPermissionCan
          I={OrgGatewayPermissionActions.AttachGateways}
          a={OrgPermissionSubjects.Gateway}
        >
          {(isAllowed) => (
            <Field data-disabled={!isAllowed}>
              <FieldLabel htmlFor="ibm-api-connect-gateway">Gateway</FieldLabel>
              <GatewayPicker
                inputId="ibm-api-connect-gateway"
                isDisabled={!isAllowed}
                value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                onChange={({ gatewayId: nextId, gatewayPoolId: nextPoolId }) => {
                  setValue("inputs.gatewayId", nextId ?? undefined, { shouldDirty: true });
                  setValue("inputs.gatewayPoolId", nextPoolId ?? undefined, { shouldDirty: true });
                }}
              />
              {!isAllowed && (
                <FieldDescription>
                  You don&apos;t have permission to attach gateways to resources.
                </FieldDescription>
              )}
            </Field>
          )}
        </OrgPermissionCan>
        <DynamicSecretProviderFields fields={credentialFields} />
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup
        id="ibm-api-connect-remote"
        presentation="panel"
        surface
        title="Organization, Catalog & Application"
      >
        <Controller
          control={control}
          name="inputs.orgId"
          render={({ field, fieldState: { error } }) => {
            const description = !credentialsComplete
              ? "Fill in all credentials above first."
              : orgsQuery.isError
                ? "Failed to load organizations. Check your credentials."
                : undefined;

            return (
              <Field
                data-invalid={Boolean(error)}
                data-disabled={!credentialsComplete || orgsQuery.isError}
              >
                <FieldLabel htmlFor="ibm-api-connect-organization">Organization</FieldLabel>
                <FilterableSelect
                  inputId="ibm-api-connect-organization"
                  isDisabled={!credentialsComplete || orgsQuery.isFetching || orgsQuery.isError}
                  isLoading={orgsQuery.isFetching}
                  options={orgsQuery.data ?? []}
                  value={orgsQuery.data?.find((option) => option.id === field.value) ?? null}
                  onBlur={field.onBlur}
                  onChange={(selection) => {
                    const option = getSingleOption(selection);
                    field.onChange(option?.id ?? "");
                    setValue("inputs.catalogId", "");
                    setValue("inputs.consumerOrgId", "");
                    setValue("inputs.appId", "");
                  }}
                  placeholder="Select an organization..."
                  getOptionLabel={(option) => option.title || option.name}
                  getOptionValue={(option) => option.id}
                  isError={Boolean(error)}
                />
                {(description || error?.message) && (
                  <FieldFeedback description={description} error={error?.message} />
                )}
              </Field>
            );
          }}
        />
        <Controller
          control={control}
          name="inputs.catalogId"
          render={({ field, fieldState: { error } }) => {
            const description = !orgSelected
              ? "Select an organization first."
              : catalogsQuery.isError
                ? "Failed to load catalogs."
                : undefined;

            return (
              <Field
                data-invalid={Boolean(error)}
                data-disabled={!orgSelected || catalogsQuery.isError}
              >
                <FieldLabel htmlFor="ibm-api-connect-catalog">Catalog</FieldLabel>
                <FilterableSelect
                  inputId="ibm-api-connect-catalog"
                  isDisabled={!orgSelected || catalogsQuery.isFetching || catalogsQuery.isError}
                  isLoading={catalogsQuery.isFetching}
                  options={catalogsQuery.data ?? []}
                  value={catalogsQuery.data?.find((option) => option.id === field.value) ?? null}
                  onBlur={field.onBlur}
                  onChange={(selection) => {
                    const option = getSingleOption(selection);
                    field.onChange(option?.id ?? "");
                    setValue("inputs.consumerOrgId", "");
                    setValue("inputs.appId", "");
                  }}
                  placeholder="Select a catalog..."
                  getOptionLabel={(option) => option.title || option.name}
                  getOptionValue={(option) => option.id}
                  isError={Boolean(error)}
                />
                {(description || error?.message) && (
                  <FieldFeedback description={description} error={error?.message} />
                )}
              </Field>
            );
          }}
        />
        <Controller
          control={control}
          name="inputs.appId"
          render={({ field, fieldState: { error } }) => {
            const description = !catalogSelected
              ? "Select a catalog first."
              : appsQuery.isError
                ? "Failed to load applications."
                : undefined;

            return (
              <Field
                data-invalid={Boolean(error)}
                data-disabled={!catalogSelected || appsQuery.isError}
              >
                <FieldLabel htmlFor="ibm-api-connect-application">Application</FieldLabel>
                <FilterableSelect
                  inputId="ibm-api-connect-application"
                  isDisabled={!catalogSelected || appsQuery.isFetching || appsQuery.isError}
                  isLoading={appsQuery.isFetching}
                  options={appsQuery.data ?? []}
                  value={appsQuery.data?.find((option) => option.id === field.value) ?? null}
                  onBlur={field.onBlur}
                  onChange={(selection) => {
                    const option = getSingleOption(selection);
                    field.onChange(option?.id ?? "");
                    setValue("inputs.consumerOrgId", option?.consumerOrgId ?? "");
                  }}
                  placeholder="Select an application..."
                  getOptionLabel={(option) => option.title || option.name}
                  getOptionValue={(option) => option.id}
                  isError={Boolean(error)}
                />
                {(description || error?.message) && (
                  <FieldFeedback description={description} error={error?.message} />
                )}
              </Field>
            );
          }}
        />
      </DynamicSecretProviderGroup>
    </>
  );
};

export const ibmApiConnectDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.IbmApiConnect,
  label: "IBM API Connect",
  customRenderer: {
    reasons: ["permission-aware-fields", "remote-options"],
    Component: IbmApiConnectFields
  },
  create: {
    schema: ibmApiConnectCreateFormSchema,
    getDefaultValues: getIbmApiConnectCreateDefaultValues,
    toPayload: getIbmApiConnectCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: ibmApiConnectEditFormSchema,
    getDefaultValues: getIbmApiConnectEditDefaultValues,
    toPayload: getIbmApiConnectEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
