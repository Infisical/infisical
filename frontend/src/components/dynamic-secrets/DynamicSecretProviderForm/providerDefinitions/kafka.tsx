import { Controller, FieldArray, Path, useFieldArray, useFormContext } from "react-hook-form";
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
import { cn } from "@app/components/v3/utils";
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
import { defineDynamicSecretProvider, TDynamicSecretProviderField } from "../types";
import {
  getDefaultKafkaAcl,
  getDefaultKafkaBootstrapServer,
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

type TKafkaRowColumn = {
  key: string;
  label: string;
  placeholder?: string;
  type?: "number";
  options?: readonly { label: string; value: string }[];
};

const bootstrapServerColumns = [
  { key: "host", label: "Host", placeholder: "kafka-1.example.com" },
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

const KafkaRows = <TName extends "inputs.bootstrapServers" | "inputs.acls">({
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
}) => {
  const { control } = useFormContext<TKafkaFormValues>();
  const rows = useFieldArray<TKafkaFormValues, TName>({ control, name });

  return (
    <div className="flex flex-col gap-3">
      {rows.fields.map(({ id }, index) => (
        <div key={id} className={cn("grid grid-cols-1 items-start gap-3", gridClassName)}>
          {columns.map((column) => {
            const fieldName = `${name}.${index}.${column.key}`;
            const inputId = fieldName.replaceAll(".", "-");
            return (
              <Controller
                key={column.key}
                control={control}
                name={fieldName as Path<TKafkaFormValues>}
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={inputId}>{column.label}</FieldLabel>
                    {column.options ? (
                      <Select
                        value={String(field.value)}
                        onValueChange={(value) => {
                          if (!value || value === field.value) return;
                          field.onChange(value);
                        }}
                      >
                        <SelectTrigger
                          ref={field.ref}
                          id={inputId}
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
                        value={field.value as string | number}
                        id={inputId}
                        type={column.type}
                        placeholder={column.placeholder}
                        isError={Boolean(error)}
                      />
                    )}
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            );
          })}
          <div className="flex flex-col gap-2">
            <FieldLabel className="pointer-events-none invisible select-none" aria-hidden>
              &nbsp;
            </FieldLabel>
            <IconButton
              type="button"
              variant="outline"
              aria-label={`Remove ${itemLabel} ${index + 1}`}
              disabled={rows.fields.length === 1}
              onClick={() => rows.remove(index)}
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
        onClick={() => rows.append(getNewRow())}
      >
        <PlusIcon /> Add {itemLabel}
      </Button>
    </div>
  );
};

const KafkaFields = () => {
  const { watch } = useFormContext<TKafkaFormValues>();
  const sslEnabled = watch("inputs.sslEnabled");

  return (
    <>
      <DynamicSecretProviderGroup
        id="kafka-bootstrap-servers"
        presentation="panel"
        surface
        title="Bootstrap Servers"
        description="Brokers Infisical tries in order until one connects."
      >
        <KafkaRows
          name="inputs.bootstrapServers"
          columns={bootstrapServerColumns}
          gridClassName="sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
          getNewRow={getDefaultKafkaBootstrapServer}
          itemLabel="Server"
        />
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup id="kafka-connection" presentation="panel">
        <DynamicSecretProviderFields fields={kafkaConnectionFields} />
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup
        id="kafka-acls"
        presentation="panel"
        surface
        title="ACLs"
        description="Granted to each lease user. Kafka denies anything these ACLs do not allow."
      >
        <KafkaRows
          name="inputs.acls"
          columns={aclColumns}
          gridClassName="sm:grid-cols-[8rem_7rem_minmax(0,1fr)_9rem_6rem_auto]"
          getNewRow={getDefaultKafkaAcl}
          itemLabel="ACL"
        />
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
