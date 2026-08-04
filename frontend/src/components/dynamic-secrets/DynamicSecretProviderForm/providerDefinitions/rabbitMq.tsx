import { Controller, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  IconButton,
  Input
} from "@app/components/v3";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import { SslRejectUnauthorizedField } from "../shared";
import {
  defineDynamicSecretProvider,
  TDynamicSecretProviderField,
  TDynamicSecretProviderFormItem
} from "../types";
import {
  getRabbitMqCreateDefaultValues,
  getRabbitMqCreatePayload,
  getRabbitMqEditDefaultValues,
  getRabbitMqEditPayload,
  rabbitMqCreateFormSchema,
  rabbitMqEditFormSchema,
  TRabbitMqFormValues
} from "./rabbitMqContract";

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
  { name: "inputs.username", type: "text", label: "Username", layout: "half" },
  {
    name: "inputs.password",
    type: "secret",
    label: "Password",
    autoComplete: "new-password",
    layout: "half"
  }
] satisfies readonly TDynamicSecretProviderField<TRabbitMqFormValues>[];

const advancedFields = [
  { name: "inputs.ca", type: "textarea", label: "CA (SSL)", isOptional: true, rows: 3 },
  {
    name: "usernameTemplate",
    type: "text",
    label: "Username Template",
    placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
  }
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

const RabbitMqFields = () => {
  const { control, setValue, watch } = useFormContext<TRabbitMqFormValues>();
  const tags = watch("inputs.tags") ?? [];

  return (
    <>
      <DynamicSecretProviderGroup id="rabbitmq-virtual-host" presentation="panel" surface title="Virtual Host">
        <DynamicSecretProviderFields fields={virtualHostFields} />
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup
        id="rabbitmq-tags"
        presentation="panel"
        surface
        title="Tags"
        description="Assign built-in tags such as management, policymaker, monitoring, or administrator, or enter a custom tag."
      >
        <div className="flex flex-col gap-3">
          {tags.map((_, index) => (
            <Controller
              // Tags are ordered scalar values, so their stable identity is their current index.
              // eslint-disable-next-line react/no-array-index-key
              key={`rabbitmq-tag-${index}`}
              control={control}
              name={`inputs.tags.${index}`}
              render={({ field, fieldState: { error } }) => (
                <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={`rabbitmq-tag-${index}`}>Tag</FieldLabel>
                    <Input
                      {...field}
                      id={`rabbitmq-tag-${index}`}
                      placeholder="management"
                      isError={Boolean(error)}
                      aria-describedby={error ? `rabbitmq-tag-${index}-error` : undefined}
                    />
                    <FieldError id={`rabbitmq-tag-${index}-error`}>{error?.message}</FieldError>
                  </Field>
                  <div className="flex flex-col gap-2">
                    <FieldLabel className="invisible pointer-events-none select-none" aria-hidden>
                      &nbsp;
                    </FieldLabel>
                    <IconButton
                      type="button"
                      variant="outline"
                      aria-label={`Remove tag ${index + 1}`}
                      onClick={() =>
                        setValue(
                          "inputs.tags",
                          tags.filter((__, itemIndex) => itemIndex !== index),
                          { shouldDirty: true }
                        )
                      }
                    >
                      <Trash2Icon />
                    </IconButton>
                  </div>
                </div>
              )}
            />
          ))}
          <Button
            type="button"
            size="sm"
            className="self-start"
            onClick={() => setValue("inputs.tags", [...tags, ""], { shouldDirty: true })}
          >
            <PlusIcon />
            Add Tag
          </Button>
        </div>
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup id="rabbitmq-advanced" presentation="collapse" title="Advanced">
        <DynamicSecretProviderFields fields={advancedFields} />
        <SslRejectUnauthorizedField />
      </DynamicSecretProviderGroup>
    </>
  );
};

export const rabbitMqDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.RabbitMq,
  label: "RabbitMQ",
  fields: rabbitMqFormFields,
  customRenderer: {
    reasons: ["repeatable-fields", "non-scalar-value"],
    Component: RabbitMqFields
  },
  create: {
    schema: rabbitMqCreateFormSchema,
    getDefaultValues: getRabbitMqCreateDefaultValues,
    toPayload: getRabbitMqCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: rabbitMqEditFormSchema,
    getDefaultValues: getRabbitMqEditDefaultValues,
    toPayload: getRabbitMqEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
