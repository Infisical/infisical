import { useEffect, useState } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { InfoIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldFeedback,
  FieldLabel,
  FieldTitle,
  IconButton,
  Input,
  Switch,
  TextArea
} from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { ProjectPermissionSub, useProject } from "@app/context";
import { OrgPermissionSubjects } from "@app/context/OrgPermissionContext";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { useCanUseProjectAppConnectionImport } from "@app/hooks";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  DynamicSecretProviders,
  KubernetesDynamicSecretCredentialType
} from "@app/hooks/api/dynamicSecret/types";
import type { VaultKubernetesRole } from "@app/hooks/api/migration/types";
import { VaultKubernetesImportModal } from "@app/pages/secret-manager/SecretDashboardPage/components/ActionBar/CreateDynamicSecretForm/VaultKubernetesImportModal";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import {
  defineDynamicSecretProvider,
  TDynamicSecretProviderField,
  TDynamicSecretProviderFormMode
} from "../types";
import {
  getKubernetesCreateDefaultValues,
  getKubernetesCreatePayload,
  getKubernetesEditDefaultValues,
  getKubernetesEditPayload,
  getKubernetesVaultImportValues,
  KUBERNETES_CUSTOM_RENDERER_REASONS,
  KubernetesAuthMethod,
  kubernetesCreateFormSchema,
  kubernetesEditFormSchema,
  KubernetesRoleType,
  normalizeKubernetesGatewayValueForMode,
  TKubernetesFormValues
} from "./kubernetesContract";

const authMethodField = [
  {
    name: "inputs.authMethod",
    type: "select",
    label: "Auth Method",
    description:
      "Token (API) uses a direct API token. Gateway uses the service account of a Gateway deployed in the Kubernetes cluster.",
    options: [
      { label: "Token (API)", value: KubernetesAuthMethod.Api },
      { label: "Gateway", value: KubernetesAuthMethod.Gateway }
    ]
  }
] satisfies readonly TDynamicSecretProviderField<TKubernetesFormValues>[];

const clusterUrlField = [
  { name: "inputs.url", type: "text", label: "Cluster URL" }
] satisfies readonly TDynamicSecretProviderField<TKubernetesFormValues>[];

const clusterTokenField = [
  {
    name: "inputs.clusterToken",
    type: "secret",
    label: "Cluster Token",
    autoComplete: "new-password"
  }
] satisfies readonly TDynamicSecretProviderField<TKubernetesFormValues>[];

const credentialTypeField = [
  {
    name: "inputs.credentialType",
    type: "select",
    label: "Credential Type",
    description:
      "Static generates tokens for a predefined service account. Dynamic creates a temporary service account and assigns a role.",
    options: [
      { label: "Static", value: KubernetesDynamicSecretCredentialType.Static },
      { label: "Dynamic", value: KubernetesDynamicSecretCredentialType.Dynamic }
    ]
  }
] satisfies readonly TDynamicSecretProviderField<TKubernetesFormValues>[];

const serviceAccountField = [
  {
    name: "inputs.serviceAccountName",
    type: "text",
    label: "Service Account Name",
    autoComplete: "new-password",
    layout: "half"
  }
] satisfies readonly TDynamicSecretProviderField<TKubernetesFormValues>[];

const usernameTemplateField = [
  {
    name: "usernameTemplate",
    type: "text",
    label: "Username Template",
    placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
    layout: "half"
  }
] satisfies readonly TDynamicSecretProviderField<TKubernetesFormValues>[];

const namespaceField = (isStatic: boolean) =>
  [
    {
      name: "inputs.namespace",
      type: "text",
      label: isStatic ? "Namespace" : "Allowed Namespace(s)",
      layout: "half"
    }
  ] satisfies readonly TDynamicSecretProviderField<TKubernetesFormValues>[];

const roleFields = [
  {
    name: "inputs.roleType",
    type: "select",
    label: "Role Type",
    layout: "half",
    options: [
      { label: "Cluster Role", value: KubernetesRoleType.ClusterRole },
      { label: "Role", value: KubernetesRoleType.Role }
    ]
  },
  { name: "inputs.role", type: "text", label: "Role", layout: "half" }
] satisfies readonly TDynamicSecretProviderField<TKubernetesFormValues>[];

const KubernetesVaultImport = ({ onImport }: { onImport: (role: VaultKubernetesRole) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { projectId } = useProject();
  const canUseAppConnectionImport = useCanUseProjectAppConnectionImport(
    ProjectPermissionSub.Secrets
  );
  const { data: vaultAppConnections = [] } = useListAvailableAppConnections(
    AppConnection.HCVault,
    projectId,
    { enabled: canUseAppConnectionImport }
  );

  if (!canUseAppConnectionImport || vaultAppConnections.length === 0) return null;

  return (
    <>
      <div className="flex flex-col gap-3 rounded-md border border-info/20 bg-info/10 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <InfoIcon className="size-4 text-info" />
          <span>Load values from HashiCorp Vault.</span>
        </div>
        <Button type="button" size="sm" variant="info" onClick={() => setIsOpen(true)}>
          <img src="/images/integrations/Vault.png" alt="" className="size-4" />
          Load from Vault
        </Button>
      </div>
      <VaultKubernetesImportModal
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        appConnections={vaultAppConnections}
        onImport={onImport}
      />
    </>
  );
};

const KubernetesFields = ({ mode }: { mode: TDynamicSecretProviderFormMode }) => {
  const { control, getValues, setValue, watch } = useFormContext<TKubernetesFormValues>();
  const audienceFields = useFieldArray({ control, name: "inputs.audiences" });
  const sslEnabled = watch("inputs.sslEnabled");
  const credentialType = watch("inputs.credentialType");
  const authMethod = watch("inputs.authMethod");
  const gatewayPoolId = watch("inputs.gatewayPoolId");
  const isStatic = credentialType === KubernetesDynamicSecretCredentialType.Static;

  useEffect(() => {
    if (
      credentialType === KubernetesDynamicSecretCredentialType.Dynamic &&
      !getValues("usernameTemplate")
    ) {
      setValue("usernameTemplate", DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE);
    }
  }, [credentialType, getValues, setValue]);

  const handleVaultImport = (role: VaultKubernetesRole) => {
    try {
      const importedValues = getKubernetesVaultImportValues(role);
      setValue("name", importedValues.name);
      setValue("inputs.url", importedValues.inputs.url);

      if (importedValues.inputs.ca) {
        setValue("inputs.ca", importedValues.inputs.ca);
        setValue("inputs.sslEnabled", true);
      }

      if (importedValues.inputs.credentialType) {
        setValue("inputs.credentialType", importedValues.inputs.credentialType);
      }

      if (importedValues.inputs.namespace !== undefined) {
        setValue("inputs.namespace", importedValues.inputs.namespace);
      }

      if (importedValues.inputs.serviceAccountName) {
        setValue("inputs.serviceAccountName", importedValues.inputs.serviceAccountName);
      }

      if (importedValues.inputs.role) {
        setValue("inputs.role", importedValues.inputs.role);
        setValue("inputs.roleType", importedValues.inputs.roleType);
      }

      if (importedValues.defaultTTL) setValue("defaultTTL", importedValues.defaultTTL);
      if (importedValues.maxTTL) setValue("maxTTL", importedValues.maxTTL);
      if (importedValues.inputs.audiences) {
        audienceFields.replace(importedValues.inputs.audiences);
      }

      createNotification({
        type: "info",
        text: "Configuration loaded successfully from HashiCorp Vault"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Failed to load configuration from HashiCorp Vault"
      });
    }
  };

  return (
    <>
      {mode === "create" && <KubernetesVaultImport onImport={handleVaultImport} />}

      <DynamicSecretProviderGroup id="kubernetes-connection" presentation="panel">
        <OrgPermissionCan
          I={OrgGatewayPermissionActions.AttachGateways}
          a={OrgPermissionSubjects.Gateway}
        >
          {(isAllowed) => (
            <Controller
              control={control}
              name="inputs.gatewayId"
              render={({ field, fieldState: { error } }) => {
                const description = !isAllowed
                  ? "You don't have permission to attach gateways to resources."
                  : undefined;
                const hasFeedback = Boolean(description || error?.message);

                return (
                  <Field
                    role="group"
                    aria-labelledby="kubernetes-gateway-label"
                    aria-describedby={hasFeedback ? "kubernetes-gateway-feedback" : undefined}
                    data-invalid={Boolean(error)}
                    data-disabled={!isAllowed}
                  >
                    <FieldLabel id="kubernetes-gateway-label">Gateway</FieldLabel>
                    <GatewayPicker
                      isDisabled={!isAllowed}
                      isError={Boolean(error)}
                      value={{
                        gatewayId: field.value ?? null,
                        gatewayPoolId: gatewayPoolId ?? null
                      }}
                      onChange={({
                        gatewayId: nextGatewayId,
                        gatewayPoolId: nextGatewayPoolId
                      }) => {
                        field.onChange(normalizeKubernetesGatewayValueForMode(mode, nextGatewayId));
                        setValue(
                          "inputs.gatewayPoolId",
                          normalizeKubernetesGatewayValueForMode(mode, nextGatewayPoolId),
                          { shouldDirty: true }
                        );
                      }}
                    />
                    {hasFeedback && (
                      <FieldFeedback
                        id="kubernetes-gateway-feedback"
                        description={description}
                        error={error?.message}
                      />
                    )}
                  </Field>
                );
              }}
            />
          )}
        </OrgPermissionCan>

        <DynamicSecretProviderFields fields={authMethodField} />

        {authMethod === KubernetesAuthMethod.Api && (
          <>
            <DynamicSecretProviderFields fields={clusterUrlField} />
            <Controller
              control={control}
              name="inputs.sslEnabled"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>Enable SSL</FieldTitle>
                    <FieldDescription>
                      Optionally provide a custom CA certificate. Leave it blank to use the system
                      CA.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    ref={field.ref}
                    checked={field.value}
                    onBlur={field.onBlur}
                    onCheckedChange={field.onChange}
                    aria-label="Enable SSL"
                  />
                </Field>
              )}
            />
            <Controller
              control={control}
              name="inputs.ca"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)} data-disabled={!sslEnabled}>
                  <FieldLabel htmlFor="kubernetes-ca">
                    CA <span className="font-normal text-muted">(optional)</span>
                  </FieldLabel>
                  <TextArea
                    {...field}
                    value={field.value ?? ""}
                    id="kubernetes-ca"
                    placeholder="-----BEGIN CERTIFICATE----- ..."
                    disabled={!sslEnabled}
                    isError={Boolean(error)}
                    aria-describedby={error ? "kubernetes-ca-error" : undefined}
                  />
                  <FieldError id="kubernetes-ca-error">{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="inputs.sslRejectUnauthorized"
              render={({ field, fieldState: { error } }) => (
                <Field
                  orientation="horizontal"
                  data-invalid={Boolean(error)}
                  data-disabled={!sslEnabled}
                >
                  <FieldContent>
                    <FieldTitle>SSL Reject Unauthorized</FieldTitle>
                    <FieldFeedback
                      id="kubernetes-ssl-reject-feedback"
                      description="Verify the server certificate against the supplied certificate authorities."
                      error={error?.message}
                    />
                  </FieldContent>
                  <Switch
                    ref={field.ref}
                    checked={field.value ?? true}
                    onBlur={field.onBlur}
                    onCheckedChange={field.onChange}
                    disabled={!sslEnabled}
                    aria-label="SSL Reject Unauthorized"
                    aria-describedby="kubernetes-ssl-reject-feedback"
                  />
                </Field>
              )}
            />
            <DynamicSecretProviderFields fields={clusterTokenField} />
          </>
        )}

        <DynamicSecretProviderFields fields={credentialTypeField} />
        <DynamicSecretProviderFields
          fields={[
            ...(isStatic ? serviceAccountField : usernameTemplateField),
            ...namespaceField(isStatic)
          ]}
        />

        {!isStatic && <DynamicSecretProviderFields fields={roleFields} />}
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup
        id="kubernetes-audiences"
        presentation="panel"
        surface
        title="Audiences"
      >
        <div className="flex flex-col gap-3">
          {audienceFields.fields.map((field, index) => (
            <div
              key={field.id}
              className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <Controller
                control={control}
                name={`inputs.audiences.${index}`}
                render={({ field: audienceField, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={`kubernetes-audience-${index}`}>Audience</FieldLabel>
                    <Input
                      {...audienceField}
                      id={`kubernetes-audience-${index}`}
                      placeholder="Enter audience"
                      isError={Boolean(error)}
                      aria-describedby={error ? `kubernetes-audience-${index}-error` : undefined}
                    />
                    <FieldError id={`kubernetes-audience-${index}-error`}>
                      {error?.message}
                    </FieldError>
                  </Field>
                )}
              />
              <div className="flex flex-col gap-2">
                <FieldLabel className="pointer-events-none invisible select-none" aria-hidden>
                  &nbsp;
                </FieldLabel>
                <IconButton
                  type="button"
                  variant="outline"
                  aria-label={`Remove audience ${index + 1}`}
                  onClick={() => audienceFields.remove(index)}
                >
                  <Trash2Icon />
                </IconButton>
              </div>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            className="self-start"
            onClick={() => audienceFields.append("")}
          >
            <PlusIcon />
            Add Audience
          </Button>
        </div>
      </DynamicSecretProviderGroup>
    </>
  );
};

export const kubernetesDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Kubernetes,
  label: "Kubernetes",
  customRenderer: {
    reasons: KUBERNETES_CUSTOM_RENDERER_REASONS,
    Component: KubernetesFields
  },
  create: {
    schema: kubernetesCreateFormSchema,
    getDefaultValues: getKubernetesCreateDefaultValues,
    toPayload: getKubernetesCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: kubernetesEditFormSchema,
    getDefaultValues: getKubernetesEditDefaultValues,
    toPayload: getKubernetesEditPayload,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});
