import { Controller, useFormContext } from "react-hook-form";

import {
  elasticSearchCreateFormSchema,
  getElasticSearchCreateDefaultValues,
  getElasticSearchCreatePayload,
  type TElasticSearchFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/elasticSearchContract";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  fieldError,
  ProviderFields,
  ProviderGroup,
  SslRejectUnauthorizedField,
  usernameTemplateFieldDefinition
} from "../fields";
import { defineFlowProvider } from "../types";

const AUTH_TYPE_OPTIONS = [
  { value: "user", label: "Username/Password" },
  { value: "api-key", label: "API Key" }
];

const hostPortFields = [
  {
    name: "inputs.host",
    type: "text",
    label: "Host",
    placeholder: "elasticsearch.example.com",
    layout: "half"
  },
  { name: "inputs.port", type: "number", label: "Port", layout: "half" }
] satisfies readonly TDynamicSecretProviderField<TElasticSearchFormValues>[];

const advancedFields = [
  {
    name: "inputs.ca",
    type: "textarea",
    label: "CA (SSL)",
    placeholder: "-----BEGIN CERTIFICATE----- ...",
    isOptional: true,
    rows: 3
  },
  usernameTemplateFieldDefinition
] satisfies readonly TDynamicSecretProviderField<TElasticSearchFormValues>[];

function ElasticSearchFields() {
  const { control, setValue, watch } = useFormContext<TElasticSearchFormValues>();
  const authType = watch("inputs.auth.type");
  const roles = watch("inputs.roles") ?? [];
  const isUser = authType === "user";

  const setAuthType = (type: string) => {
    if (!type || type === authType) return;
    setValue(
      "inputs.auth",
      type === "user"
        ? { type, username: "", password: "" }
        : { type: "api-key", apiKey: "", apiKeyId: "" },
      { shouldDirty: true }
    );
  };

  return (
    <>
      <ProviderGroup id="elasticsearch-connection" presentation="panel">
        <ProviderFields fields={hostPortFields} />
        <div className="grid grid-cols-3 items-start gap-3">
          <Controller
            control={control}
            name="inputs.auth.type"
            render={({ field, fieldState: { error } }) => (
              <Field label="Authentication Method" error={fieldError(error)}>
                <Select
                  value={field.value}
                  invalid={Boolean(error)}
                  options={AUTH_TYPE_OPTIONS}
                  onValueChange={setAuthType}
                />
              </Field>
            )}
          />
          <Controller
            key={`identity-${authType}`}
            control={control}
            name={isUser ? "inputs.auth.username" : "inputs.auth.apiKeyId"}
            render={({ field, fieldState: { error } }) => (
              <Field label={isUser ? "Username" : "API Key ID"} error={fieldError(error)}>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder={isUser ? "elastic" : "Enter API key ID"}
                  autoComplete="off"
                  invalid={Boolean(error)}
                />
              </Field>
            )}
          />
          <Controller
            key={`secret-${authType}`}
            control={control}
            name={isUser ? "inputs.auth.password" : "inputs.auth.apiKey"}
            render={({ field, fieldState: { error } }) => (
              <Field label={isUser ? "Password" : "API Key"} error={fieldError(error)}>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  type="password"
                  placeholder={isUser ? "Enter password" : "Enter API key"}
                  autoComplete="new-password"
                  invalid={Boolean(error)}
                />
              </Field>
            )}
          />
        </div>
      </ProviderGroup>

      <ProviderGroup
        id="elasticsearch-roles"
        presentation="panel"
        surface
        title="Roles"
        description="Assign built-in roles such as superuser, apm_user, kibana_admin, or monitoring_user, or enter a custom role."
      >
        <Stack gap={12} align="start">
          {roles.map((_, index) => (
            <Controller
              // eslint-disable-next-line react/no-array-index-key -- roles are ordered scalars, so their identity is their index
              key={`elasticsearch-role-${index}`}
              control={control}
              name={`inputs.roles.${index}`}
              render={({ field, fieldState: { error } }) => (
                <Field label="Role" error={fieldError(error)}>
                  <Inline gap={8} align="start" wrap={false}>
                    <div className="min-w-0 flex-1">
                      <Input {...field} placeholder="superuser" invalid={Boolean(error)} />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      icon="trash"
                      iconOnly
                      aria-label={`Remove role ${index + 1}`}
                      disabled={roles.length === 1}
                      onClick={() =>
                        setValue(
                          "inputs.roles",
                          roles.filter((__, itemIndex) => itemIndex !== index),
                          { shouldDirty: true }
                        )
                      }
                    />
                  </Inline>
                </Field>
              )}
            />
          ))}
          <Button
            variant="outline"
            type="button"
            size="sm"
            icon="plus"
            onClick={() => setValue("inputs.roles", [...roles, ""], { shouldDirty: true })}
          >
            Add Role
          </Button>
        </Stack>
      </ProviderGroup>

      <ProviderGroup id="elasticsearch-advanced" presentation="collapse" title="Advanced">
        <ProviderFields fields={advancedFields} />
        <SslRejectUnauthorizedField<TElasticSearchFormValues> />
      </ProviderGroup>
    </>
  );
}

export const elasticSearchFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.ElasticSearch,
  label: "Elasticsearch",
  schema: elasticSearchCreateFormSchema,
  getDefaultValues: getElasticSearchCreateDefaultValues,
  toPayload: getElasticSearchCreatePayload,
  Renderer: ElasticSearchFields,
  submitLabel: "Submit"
});
