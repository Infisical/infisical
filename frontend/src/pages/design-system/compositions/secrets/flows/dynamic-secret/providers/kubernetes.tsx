import { useEffect } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import {
  getKubernetesCreateDefaultValues,
  getKubernetesCreatePayload,
  KubernetesAuthMethod,
  kubernetesCreateFormSchema,
  KubernetesRoleType,
  normalizeKubernetesGatewayValueForMode,
  type TKubernetesFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/kubernetesContract";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/schemas";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { Button } from "@app/components/v4/ui/button";
import { Field, FieldError } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Switch } from "@app/components/v4/ui/switch";
import { Textarea } from "@app/components/v4/ui/textarea";
import {
  DynamicSecretProviders,
  KubernetesDynamicSecretCredentialType
} from "@app/hooks/api/dynamicSecret/types";

import { fieldError, GatewayPicker, ProviderFields, ProviderGroup } from "../fields";
import { defineFlowProvider } from "../types";

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
  {
    name: "inputs.url",
    type: "text",
    label: "Cluster URL",
    placeholder: "https://kubernetes.example.com:6443"
  }
] satisfies readonly TDynamicSecretProviderField<TKubernetesFormValues>[];

const clusterTokenField = [
  {
    name: "inputs.clusterToken",
    type: "secret",
    label: "Cluster Token",
    placeholder: "Enter service account token",
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
    placeholder: "infisical-dynamic-secrets",
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
      placeholder: isStatic ? "default" : "default,production",
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
  {
    name: "inputs.role",
    type: "text",
    label: "Role",
    placeholder: "view",
    layout: "half"
  }
] satisfies readonly TDynamicSecretProviderField<TKubernetesFormValues>[];

function KubernetesFields() {
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

  return (
    <>
      <ProviderGroup id="kubernetes-connection">
        <Controller
          control={control}
          name="inputs.gatewayId"
          render={({ field, fieldState: { error } }) => (
            <Field label="Gateway" error={fieldError(error)}>
              <GatewayPicker
                invalid={Boolean(error)}
                value={{ gatewayId: field.value ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                onChange={({ gatewayId: nextGatewayId, gatewayPoolId: nextGatewayPoolId }) => {
                  field.onChange(normalizeKubernetesGatewayValueForMode("create", nextGatewayId));
                  setValue(
                    "inputs.gatewayPoolId",
                    normalizeKubernetesGatewayValueForMode("create", nextGatewayPoolId),
                    { shouldDirty: true }
                  );
                }}
              />
            </Field>
          )}
        />

        <ProviderFields fields={authMethodField} />

        {authMethod === KubernetesAuthMethod.Api && (
          <>
            <ProviderFields fields={clusterUrlField} />
            <Controller
              control={control}
              name="inputs.sslEnabled"
              render={({ field }) => (
                <Switch
                  ref={field.ref}
                  layout="row"
                  label="Enable SSL"
                  description="Optionally provide a custom CA certificate. Leave it blank to use the system CA."
                  checked={field.value}
                  onBlur={field.onBlur}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Controller
              control={control}
              name="inputs.ca"
              render={({ field, fieldState: { error } }) => (
                <Field label="CA" optional error={fieldError(error)}>
                  <Textarea
                    ref={field.ref}
                    name={field.name}
                    value={field.value ?? ""}
                    placeholder="-----BEGIN CERTIFICATE----- ..."
                    disabled={!sslEnabled}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                  />
                </Field>
              )}
            />
            <Controller
              control={control}
              name="inputs.sslRejectUnauthorized"
              render={({ field, fieldState: { error } }) => (
                <Stack gap={4}>
                  <Switch
                    ref={field.ref}
                    layout="row"
                    label="SSL Reject Unauthorized"
                    description="Verify the server certificate against the supplied certificate authorities."
                    checked={field.value ?? true}
                    disabled={!sslEnabled}
                    onBlur={field.onBlur}
                    onCheckedChange={field.onChange}
                    aria-invalid={Boolean(error) || undefined}
                  />
                  {fieldError(error) && <FieldError>{fieldError(error)}</FieldError>}
                </Stack>
              )}
            />
            <ProviderFields fields={clusterTokenField} />
          </>
        )}

        <ProviderFields fields={credentialTypeField} />
        <ProviderFields
          fields={[
            ...(isStatic ? serviceAccountField : usernameTemplateField),
            ...namespaceField(isStatic)
          ]}
        />

        {!isStatic && <ProviderFields fields={roleFields} />}
      </ProviderGroup>

      <ProviderGroup id="kubernetes-audiences" surface title="Audiences">
        <Stack gap={12}>
          {audienceFields.fields.map((audience, index) => (
            <div key={audience.id} className="flex items-end gap-3">
              <Controller
                control={control}
                name={`inputs.audiences.${index}`}
                render={({ field, fieldState: { error } }) => (
                  <Field className="flex-1" label="Audience" error={fieldError(error)}>
                    <Input
                      ref={field.ref}
                      name={field.name}
                      value={field.value}
                      placeholder="Enter audience"
                      invalid={Boolean(error)}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                    />
                  </Field>
                )}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                icon="trash"
                iconOnly
                aria-label={`Remove audience ${index + 1}`}
                onClick={() => audienceFields.remove(index)}
              >
                {`Remove audience ${index + 1}`}
              </Button>
            </div>
          ))}
          <div>
            <Button
              variant="outline"
              type="button"
              size="sm"
              icon="plus"
              onClick={() => audienceFields.append("")}
            >
              Add Audience
            </Button>
          </div>
        </Stack>
      </ProviderGroup>
    </>
  );
}

export const kubernetesFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.Kubernetes,
  label: "Kubernetes",
  schema: kubernetesCreateFormSchema,
  getDefaultValues: getKubernetesCreateDefaultValues,
  toPayload: getKubernetesCreatePayload,
  Renderer: KubernetesFields,
  submitLabel: "Submit"
});
