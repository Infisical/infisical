import { Controller, useFormContext } from "react-hook-form";

import {
  getRabbitMqCreateDefaultValues,
  getRabbitMqCreatePayload,
  rabbitMqCreateFormSchema,
  type TRabbitMqFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/rabbitMqContract";
import type {
  TDynamicSecretProviderField,
  TDynamicSecretProviderFormItem
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  fieldError,
  ProviderFields,
  ProviderGroup,
  SslRejectUnauthorizedField,
  usernameTemplateFieldDefinition
} from "../fields";
import { defineFlowProvider } from "../types";

const rabbitMqConnectionFields = [
  {
    name: "inputs.host",
    type: "text",
    label: "Host",
    placeholder: "https://your-rabbitmq-host.com",
    layout: "half"
  },
  {
    name: "inputs.port",
    type: "number",
    label: "Management Port",
    description: "The port on which the RabbitMQ management plugin is running. Default is 15672.",
    layout: "half"
  },
  {
    name: "inputs.username",
    type: "text",
    label: "Username",
    placeholder: "admin",
    layout: "half"
  },
  {
    name: "inputs.password",
    type: "secret",
    label: "Password",
    placeholder: "Enter management password",
    autoComplete: "new-password",
    layout: "half"
  }
] satisfies readonly TDynamicSecretProviderField<TRabbitMqFormValues>[];

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
] satisfies readonly TDynamicSecretProviderField<TRabbitMqFormValues>[];

const virtualHostFields = [
  {
    name: "inputs.virtualHost.name",
    type: "text",
    label: "Name",
    placeholder: "/virtual-host",
    description: "The virtual host to which the user will be assigned. Default is /.",
    layout: "half"
  },
  {
    name: "inputs.virtualHost.permissions.read",
    type: "text",
    label: "Read Permissions",
    placeholder: ".*",
    layout: "half"
  },
  {
    name: "inputs.virtualHost.permissions.write",
    type: "text",
    label: "Write Permissions",
    placeholder: ".*",
    layout: "half"
  },
  {
    name: "inputs.virtualHost.permissions.configure",
    type: "text",
    label: "Configure Permissions",
    placeholder: ".*",
    layout: "half"
  }
] satisfies readonly TDynamicSecretProviderField<TRabbitMqFormValues>[];

const rabbitMqFormFields = [
  {
    kind: "group",
    id: "rabbitmq-connection",
    presentation: "panel",
    fields: rabbitMqConnectionFields
  }
] satisfies readonly TDynamicSecretProviderFormItem<TRabbitMqFormValues>[];

function RabbitMqFields() {
  const { control, setValue, watch } = useFormContext<TRabbitMqFormValues>();
  const tags = watch("inputs.tags") ?? [];

  return (
    <>
      <ProviderGroup id="rabbitmq-virtual-host" presentation="panel" surface title="Virtual Host">
        <ProviderFields fields={virtualHostFields} />
      </ProviderGroup>

      <ProviderGroup
        id="rabbitmq-tags"
        presentation="panel"
        surface
        title="Tags"
        description="Assign built-in tags such as management, policymaker, monitoring, or administrator, or enter a custom tag."
      >
        <Stack gap={12} align="start">
          {tags.map((_, index) => (
            <Controller
              // eslint-disable-next-line react/no-array-index-key -- tags are ordered scalars, so their identity is their index
              key={`rabbitmq-tag-${index}`}
              control={control}
              name={`inputs.tags.${index}`}
              render={({ field, fieldState: { error } }) => (
                <Field label="Tag" error={fieldError(error)}>
                  <Inline gap={8} align="start" wrap={false}>
                    <div className="min-w-0 flex-1">
                      <Input {...field} placeholder="management" invalid={Boolean(error)} />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      icon="trash"
                      iconOnly
                      aria-label={`Remove tag ${index + 1}`}
                      onClick={() =>
                        setValue(
                          "inputs.tags",
                          tags.filter((__, itemIndex) => itemIndex !== index),
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
            onClick={() => setValue("inputs.tags", [...tags, ""], { shouldDirty: true })}
          >
            Add Tag
          </Button>
        </Stack>
      </ProviderGroup>

      <ProviderGroup id="rabbitmq-advanced" presentation="collapse" title="Advanced">
        <ProviderFields fields={advancedFields} />
        <SslRejectUnauthorizedField<TRabbitMqFormValues> />
      </ProviderGroup>
    </>
  );
}

export const rabbitMqFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.RabbitMq,
  label: "RabbitMQ",
  schema: rabbitMqCreateFormSchema,
  getDefaultValues: getRabbitMqCreateDefaultValues,
  toPayload: getRabbitMqCreatePayload,
  fields: rabbitMqFormFields,
  Renderer: RabbitMqFields,
  submitLabel: "Submit"
});
