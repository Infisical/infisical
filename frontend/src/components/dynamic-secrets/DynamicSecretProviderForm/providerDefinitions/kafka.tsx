import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import {
  DynamicSecretProviders,
  KafkaAclOperation,
  KafkaAclPatternType,
  KafkaAclPermissionType,
  KafkaAclResourceType,
  KafkaSaslMechanism
} from "@app/hooks/api/dynamicSecret/types";

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
  getDefaultKafkaAcl,
  getKafkaCreateDefaultValues,
  getKafkaCreatePayload,
  getKafkaEditDefaultValues,
  getKafkaEditPayload,
  KAFKA_CUSTOM_RENDERER_REASONS,
  kafkaCreateFormSchema,
  kafkaEditFormSchema,
  TKafkaFormValues
} from "./kafkaContract";

const kafkaConnectionFields = [
  {
    name: "inputs.host",
    type: "text",
    label: "Host",
    placeholder: "kafka.example.com",
    description: "Any broker in the cluster.",
    layout: "half"
  },
  { name: "inputs.port", type: "number", label: "Port", placeholder: "9092", layout: "half" },
  {
    name: "inputs.saslMechanism",
    type: "select",
    label: "SASL Mechanism",
    description: "How Infisical authenticates as the admin user.",
    options: Object.values(KafkaSaslMechanism).map((value) => ({ label: value, value }))
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
    placeholder: "Enter admin password",
    autoComplete: "new-password",
    layout: "half"
  }
] satisfies readonly TDynamicSecretProviderField<TKafkaFormValues>[];

const advancedFields = [
  {
    name: "usernameTemplate",
    type: "text",
    label: "Username Template",
    placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
  },
  {
    name: "inputs.sslEnabled",
    type: "switch",
    label: "Enable SSL",
    description: "Connect to the broker over TLS."
  }
] satisfies readonly TDynamicSecretProviderField<TKafkaFormValues>[];

const caField = {
  name: "inputs.ca",
  type: "textarea",
  label: "CA Certificate",
  placeholder: "-----BEGIN CERTIFICATE----- ...",
  isOptional: true,
  description: "PEM-encoded CA certificate used to verify the broker.",
  rows: 3
} satisfies TDynamicSecretProviderField<TKafkaFormValues>;

const aclColumns = [
  {
    key: "resourceType",
    label: "Resource Type",
    options: [
      { label: "Topic", value: KafkaAclResourceType.Topic },
      { label: "Group", value: KafkaAclResourceType.Group },
      { label: "Cluster", value: KafkaAclResourceType.Cluster },
      { label: "Transactional ID", value: KafkaAclResourceType.TransactionalId }
    ]
  },
  {
    key: "patternType",
    label: "Pattern",
    options: [
      { label: "Literal", value: KafkaAclPatternType.Literal },
      { label: "Prefixed", value: KafkaAclPatternType.Prefixed }
    ]
  },
  { key: "resourceName", label: "Resource Name" },
  {
    key: "operation",
    label: "Operation",
    options: [
      { label: "All", value: KafkaAclOperation.All },
      { label: "Read", value: KafkaAclOperation.Read },
      { label: "Write", value: KafkaAclOperation.Write },
      { label: "Create", value: KafkaAclOperation.Create },
      { label: "Delete", value: KafkaAclOperation.Delete },
      { label: "Alter", value: KafkaAclOperation.Alter },
      { label: "Describe", value: KafkaAclOperation.Describe },
      { label: "Describe Configs", value: KafkaAclOperation.DescribeConfigs },
      { label: "Alter Configs", value: KafkaAclOperation.AlterConfigs },
      { label: "Idempotent Write", value: KafkaAclOperation.IdempotentWrite }
    ]
  },
  {
    key: "permissionType",
    label: "Permission",
    options: [
      { label: "Allow", value: KafkaAclPermissionType.Allow },
      { label: "Deny", value: KafkaAclPermissionType.Deny }
    ]
  }
] as const;

const kafkaFormFields = [
  {
    kind: "group",
    id: "kafka-connection",
    presentation: "panel",
    fields: kafkaConnectionFields
  }
] satisfies readonly TDynamicSecretProviderFormItem<TKafkaFormValues>[];

const KafkaFields = () => {
  const { control, watch } = useFormContext<TKafkaFormValues>();
  const acls = useFieldArray({ control, name: "inputs.acls" });
  const sslEnabled = watch("inputs.sslEnabled");

  return (
    <>
      <DynamicSecretProviderGroup
        id="kafka-acls"
        presentation="panel"
        surface
        title="ACLs"
        description="Granted to each lease user. Kafka denies anything these ACLs do not allow."
      >
        <div className="flex flex-col gap-3">
          {acls.fields.map(({ id }, index) => (
            <div
              key={id}
              className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[8rem_7rem_minmax(0,1fr)_9rem_6rem_auto]"
            >
              {aclColumns.map((column) => (
                <Controller
                  key={column.key}
                  control={control}
                  name={`inputs.acls.${index}.${column.key}`}
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`kafka-acl-${index}-${column.key}`}>
                        {column.label}
                      </FieldLabel>
                      {"options" in column ? (
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            if (!value || value === field.value) return;
                            field.onChange(value);
                          }}
                        >
                          <SelectTrigger
                            ref={field.ref}
                            id={`kafka-acl-${index}-${column.key}`}
                            onBlur={field.onBlur}
                            isError={Boolean(error)}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {column.options.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          {...field}
                          id={`kafka-acl-${index}-${column.key}`}
                          placeholder="orders"
                          isError={Boolean(error)}
                        />
                      )}
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              ))}
              <div className="flex flex-col gap-2">
                <FieldLabel className="pointer-events-none invisible select-none" aria-hidden>
                  &nbsp;
                </FieldLabel>
                <IconButton
                  type="button"
                  variant="outline"
                  aria-label={`Remove ACL ${index + 1}`}
                  disabled={acls.fields.length === 1}
                  onClick={() => acls.remove(index)}
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
            onClick={() => acls.append(getDefaultKafkaAcl())}
          >
            <PlusIcon /> Add ACL
          </Button>
        </div>
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup id="kafka-advanced" presentation="collapse" title="Advanced">
        <DynamicSecretProviderFields
          fields={sslEnabled ? [...advancedFields, caField] : advancedFields}
        />
        {sslEnabled && <SslRejectUnauthorizedField />}
      </DynamicSecretProviderGroup>
    </>
  );
};

export const kafkaDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Kafka,
  label: "Kafka",
  fields: kafkaFormFields,
  customRenderer: {
    reasons: KAFKA_CUSTOM_RENDERER_REASONS,
    Component: KafkaFields
  },
  create: {
    schema: kafkaCreateFormSchema,
    getDefaultValues: getKafkaCreateDefaultValues,
    toPayload: getKafkaCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: kafkaEditFormSchema,
    getDefaultValues: getKafkaEditDefaultValues,
    toPayload: getKafkaEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
