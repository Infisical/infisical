import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldFeedback,
  FieldLabel,
  FieldTitle,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch
} from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { DynamicSecretProviders, MILVUS_OBJECT_TYPES } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import {
  defineDynamicSecretProvider,
  TDynamicSecretProviderField,
  TDynamicSecretProviderFormMode
} from "../types";
import {
  getMilvusCreateDefaultValues,
  getMilvusCreatePayload,
  getMilvusEditDefaultValues,
  getMilvusEditPayload,
  milvusCreateFormSchema,
  milvusEditFormSchema,
  TMilvusFormValues
} from "./milvusContract";

const privilegeLabels = {
  objectName: "Object Name",
  privilege: "Privilege",
  dbName: "DB Name"
} as const;

const privilegePlaceholders = {
  objectName: "*",
  privilege: "Search",
  dbName: "default"
} as const;

const connectionFields = [
  {
    name: "inputs.host",
    type: "text",
    label: "Host",
    placeholder: "http://localhost",
    description: "The URL scheme defaults to HTTPS when a CA is provided and HTTP otherwise.",
    layout: "half"
  },
  { name: "inputs.port", type: "number", label: "Port", placeholder: "19530", layout: "half" },
  { name: "inputs.username", type: "text", label: "Username", layout: "half" },
  {
    name: "inputs.password",
    type: "secret",
    label: "Password",
    autoComplete: "new-password",
    layout: "half"
  },
  {
    name: "inputs.database",
    type: "text",
    label: "Default Database",
    placeholder: "default",
    description: "Used as dbName for privileges that do not override it."
  }
] satisfies readonly TDynamicSecretProviderField<TMilvusFormValues>[];

const trailingFields = [
  {
    name: "usernameTemplate",
    type: "text",
    label: "Username Template",
    placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
    description: "Milvus usernames are limited to 32 characters; longer output is truncated."
  },
  {
    name: "inputs.ca",
    type: "textarea",
    label: "CA Certificate",
    isOptional: true,
    description: "PEM-encoded CA certificate used to verify the Milvus server.",
    rows: 3
  }
] satisfies readonly TDynamicSecretProviderField<TMilvusFormValues>[];

const MilvusMetadataFields = () => {
  const { control } = useFormContext<TMilvusFormValues>();
  const fields = useFieldArray({ control, name: "metadata" });
  return (
    <DynamicSecretProviderGroup id="milvus-metadata" presentation="panel" surface title="Metadata">
      {fields.fields.length === 0 ? (
        <Empty className="gap-2 border p-6 md:p-6">
          <EmptyHeader>
            <EmptyTitle>No metadata entries</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" size="sm" onClick={() => fields.append({ key: "", value: "" })}>
              <PlusIcon /> Add Entry
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {fields.fields.map(({ id }, index) => (
            <div key={id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
              <Controller
                control={control}
                name={`metadata.${index}.key`}
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={`milvus-metadata-${index}-key`}>Key</FieldLabel>
                    <Input
                      {...field}
                      id={`milvus-metadata-${index}-key`}
                      isError={Boolean(error)}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name={`metadata.${index}.value`}
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={`milvus-metadata-${index}-value`}>
                      Value <span className="font-normal text-muted">(optional)</span>
                    </FieldLabel>
                    <Input
                      {...field}
                      id={`milvus-metadata-${index}-value`}
                      isError={Boolean(error)}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <IconButton
                type="button"
                variant="outline"
                aria-label={`Remove metadata entry ${index + 1}`}
                onClick={() => fields.remove(index)}
              >
                <Trash2Icon />
              </IconButton>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            className="self-start"
            onClick={() => fields.append({ key: "", value: "" })}
          >
            <PlusIcon /> Add Entry
          </Button>
        </div>
      )}
    </DynamicSecretProviderGroup>
  );
};

const MilvusFields = ({ mode }: { mode: TDynamicSecretProviderFormMode }) => {
  const { control, setValue, watch } = useFormContext<TMilvusFormValues>();
  const privileges = useFieldArray({ control, name: "inputs.privileges" });
  const gatewayId = watch("inputs.gatewayId");
  const gatewayPoolId = watch("inputs.gatewayPoolId");
  return (
    <>
      <DynamicSecretProviderGroup id="milvus-connection" presentation="panel">
        <OrgPermissionCan
          I={OrgGatewayPermissionActions.AttachGateways}
          a={OrgPermissionSubjects.Gateway}
        >
          {(isAllowed) => (
            <Field data-disabled={!isAllowed}>
              <FieldLabel htmlFor="milvus-gateway">Gateway</FieldLabel>
              <GatewayPicker
                inputId="milvus-gateway"
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
        <DynamicSecretProviderFields fields={connectionFields} />
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup
        id="milvus-privileges"
        presentation="panel"
        surface
        title="Privileges"
        description="Privileges granted to the ephemeral role assigned to the lease user."
      >
        <div className="flex flex-col gap-3">
          {privileges.fields.map(({ id }, index) => (
            <div
              key={id}
              className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[9rem_1fr_1fr_1fr_auto]"
            >
              <Controller
                control={control}
                name={`inputs.privileges.${index}.objectType`}
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={`milvus-privilege-${index}-type`}>Object Type</FieldLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        if (!value || value === field.value) return;
                        field.onChange(value);
                      }}
                    >
                      <SelectTrigger
                        ref={field.ref}
                        id={`milvus-privilege-${index}-type`}
                        onBlur={field.onBlur}
                        isError={Boolean(error)}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MILVUS_OBJECT_TYPES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              {(["objectName", "privilege", "dbName"] as const).map((key) => (
                <Controller
                  key={key}
                  control={control}
                  name={`inputs.privileges.${index}.${key}`}
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`milvus-privilege-${index}-${key}`}>
                        {privilegeLabels[key]}
                        {key === "dbName" && (
                          <span className="font-normal text-muted"> (optional)</span>
                        )}
                      </FieldLabel>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        id={`milvus-privilege-${index}-${key}`}
                        placeholder={privilegePlaceholders[key]}
                        isError={Boolean(error)}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              ))}
              <div className="flex flex-col gap-2">
                <FieldLabel className="invisible pointer-events-none select-none" aria-hidden>
                  &nbsp;
                </FieldLabel>
                <IconButton
                  type="button"
                  variant="outline"
                  aria-label={`Remove privilege ${index + 1}`}
                  onClick={() => privileges.remove(index)}
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
            onClick={() =>
              privileges.append({
                objectType: "Collection",
                objectName: "*",
                privilege: "",
                dbName: undefined
              })
            }
          >
            <PlusIcon /> Add Privilege
          </Button>
        </div>
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup id="milvus-advanced" presentation="collapse" title="Advanced">
        <DynamicSecretProviderFields fields={trailingFields} />
        <Controller
          control={control}
          name="inputs.sslRejectUnauthorized"
          render={({ field, fieldState: { error } }) => (
            <Field orientation="horizontal" data-invalid={Boolean(error)}>
              <FieldContent>
                <FieldTitle>SSL Reject Unauthorized</FieldTitle>
                <FieldFeedback
                  id="milvus-ssl-reject-feedback"
                  description="Verify the server certificate against the supplied certificate authorities."
                  error={error?.message}
                />
              </FieldContent>
              <Switch
                ref={field.ref}
                checked={field.value ?? true}
                onBlur={field.onBlur}
                onCheckedChange={field.onChange}
                aria-label="SSL Reject Unauthorized"
              />
            </Field>
          )}
        />
      </DynamicSecretProviderGroup>
      {mode === "edit" && <MilvusMetadataFields />}
    </>
  );
};

export const milvusDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Milvus,
  label: "Milvus",
  customRenderer: {
    reasons: ["repeatable-fields", "permission-aware-fields", "non-scalar-value"],
    Component: MilvusFields
  },
  create: {
    schema: milvusCreateFormSchema,
    getDefaultValues: getMilvusCreateDefaultValues,
    toPayload: getMilvusCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: milvusEditFormSchema,
    getDefaultValues: getMilvusEditDefaultValues,
    toPayload: getMilvusEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
