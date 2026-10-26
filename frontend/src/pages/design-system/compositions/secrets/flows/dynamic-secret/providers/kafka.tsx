import {
  Controller,
  type FieldArray,
  type Path,
  useFieldArray,
  useFormContext
} from "react-hook-form";

import {
  getDefaultKafkaAcl,
  getDefaultKafkaBootstrapServer,
  getKafkaCreateDefaultValues,
  getKafkaCreatePayload,
  getKafkaEditDefaultValues,
  getKafkaEditPayload,
  kafkaCreateFormSchema,
  kafkaEditFormSchema,
  TKafkaFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/kafkaContract";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import {
  DynamicSecretProviders,
  KafkaAclOperation,
  KafkaAclPatternType,
  KafkaAclPermissionType,
  KafkaAclResourceType,
  KafkaSaslMechanism
} from "@app/hooks/api/dynamicSecret/types";

import {
  fieldError,
  ProviderFields,
  ProviderGroup,
  SslRejectUnauthorizedField,
  usernameTemplateFieldDefinition
} from "../fields";
import { defineFlowProvider } from "../types";

const kafkaConnectionFields = [
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
  usernameTemplateFieldDefinition,
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

type TKafkaRowColumn = {
  key: string;
  label: string;
  placeholder?: string;
  type?: "number";
  options?: readonly { label: string; value: string }[];
  className?: string;
};

const bootstrapServerColumns = [
  { key: "host", label: "Host", placeholder: "kafka-1.example.com", className: "col-span-4" },
  { key: "port", label: "Port", placeholder: "9092", type: "number" }
] satisfies readonly TKafkaRowColumn[];

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
  { key: "resourceName", label: "Resource Name", placeholder: "orders" },
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
] satisfies readonly TKafkaRowColumn[];

function KafkaRows<TName extends "inputs.bootstrapServers" | "inputs.acls">({
  name,
  columns,
  gridClassName,
  getNewRow,
  itemLabel
}: {
  name: TName;
  columns: readonly TKafkaRowColumn[];
  gridClassName: string;
  getNewRow: () => FieldArray<TKafkaFormValues, TName>;
  itemLabel: string;
}) {
  const { control } = useFormContext<TKafkaFormValues>();
  const rows = useFieldArray<TKafkaFormValues, TName>({ control, name });

  return (
    <Stack gap={12} align="start">
      {rows.fields.map(({ id }, index) => (
        <div key={id} className={`grid w-full items-start gap-3 ${gridClassName}`}>
          {columns.map((column) => (
            <Controller
              key={column.key}
              control={control}
              name={`${name}.${index}.${column.key}` as Path<TKafkaFormValues>}
              render={({ field, fieldState: { error } }) => (
                <Field
                  wide
                  className={column.className}
                  label={column.label}
                  error={fieldError(error)}
                >
                  {column.options ? (
                    <Select
                      value={String(field.value)}
                      invalid={Boolean(error)}
                      options={column.options}
                      onValueChange={(value) => {
                        if (!value || value === field.value) return;
                        field.onChange(value);
                      }}
                    />
                  ) : (
                    <Input
                      ref={field.ref}
                      name={field.name}
                      value={field.value as string | number}
                      type={column.type}
                      placeholder={column.placeholder}
                      invalid={Boolean(error)}
                      onBlur={field.onBlur}
                      onChange={field.onChange}
                    />
                  )}
                </Field>
              )}
            />
          ))}
          <div className="flex h-full items-end">
            <Button
              type="button"
              variant="outline"
              icon="trash"
              iconOnly
              aria-label={`Remove ${itemLabel} ${index + 1}`}
              disabled={rows.fields.length === 1}
              onClick={() => rows.remove(index)}
            >
              Remove {itemLabel} {index + 1}
            </Button>
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        type="button"
        size="sm"
        icon="plus"
        onClick={() => rows.append(getNewRow())}
      >
        Add {itemLabel}
      </Button>
    </Stack>
  );
}

function KafkaFields() {
  const { watch } = useFormContext<TKafkaFormValues>();
  const sslEnabled = watch("inputs.sslEnabled");

  return (
    <>
      <ProviderGroup
        id="kafka-bootstrap-servers"
        surface
        title="Bootstrap Servers"
        description="Brokers Infisical tries in order until one connects."
      >
        <KafkaRows
          name="inputs.bootstrapServers"
          columns={bootstrapServerColumns}
          gridClassName="grid-cols-6"
          getNewRow={getDefaultKafkaBootstrapServer}
          itemLabel="Server"
        />
      </ProviderGroup>

      <ProviderGroup id="kafka-connection">
        <ProviderFields fields={kafkaConnectionFields} />
      </ProviderGroup>

      <ProviderGroup
        id="kafka-acls"
        surface
        title="ACLs"
        description="Granted to each lease user. Kafka denies anything these ACLs do not allow."
      >
        <KafkaRows
          name="inputs.acls"
          columns={aclColumns}
          gridClassName="grid-cols-3"
          getNewRow={getDefaultKafkaAcl}
          itemLabel="ACL"
        />
      </ProviderGroup>

      <ProviderGroup id="kafka-advanced" presentation="collapse" title="Advanced">
        <ProviderFields<TKafkaFormValues>
          fields={sslEnabled ? [...advancedFields, caField] : advancedFields}
        />
        {sslEnabled && <SslRejectUnauthorizedField<TKafkaFormValues> />}
      </ProviderGroup>
    </>
  );
}

export const kafkaFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.Kafka,
  label: "Kafka",
  schema: kafkaCreateFormSchema,
  getDefaultValues: getKafkaCreateDefaultValues,
  toPayload: getKafkaCreatePayload,
  Renderer: KafkaFields,
  submitLabel: "Submit",
  edit: {
    schema: kafkaEditFormSchema,
    getDefaultValues: getKafkaEditDefaultValues,
    toPayload: getKafkaEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
