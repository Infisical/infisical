import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import {
  getMilvusCreateDefaultValues,
  getMilvusCreatePayload,
  getMilvusEditDefaultValues,
  getMilvusEditPayload,
  milvusCreateFormSchema,
  milvusEditFormSchema,
  type TMilvusFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/milvusContract";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/schemas";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import { DynamicSecretProviders, MILVUS_OBJECT_TYPES } from "@app/hooks/api/dynamicSecret/types";

import {
  fieldError,
  GatewayPicker,
  MetadataFields,
  ProviderFields,
  ProviderGroup,
  SslRejectUnauthorizedField
} from "../fields";
import { defineFlowProvider, type DynamicSecretRendererProps } from "../types";

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
  {
    name: "inputs.username",
    type: "text",
    label: "Username",
    placeholder: "root",
    layout: "half"
  },
  {
    name: "inputs.password",
    type: "secret",
    label: "Password",
    placeholder: "Enter database password",
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
    placeholder: "-----BEGIN CERTIFICATE----- ...",
    isOptional: true,
    description: "PEM-encoded CA certificate used to verify the Milvus server.",
    rows: 3
  }
] satisfies readonly TDynamicSecretProviderField<TMilvusFormValues>[];

function MilvusFields({ mode }: Pick<DynamicSecretRendererProps, "mode">) {
  const { control, setValue, watch } = useFormContext<TMilvusFormValues>();
  const privileges = useFieldArray({ control, name: "inputs.privileges" });
  const gatewayId = watch("inputs.gatewayId");
  const gatewayPoolId = watch("inputs.gatewayPoolId");
  return (
    <>
      <ProviderGroup id="milvus-connection">
        <Field wide label="Gateway">
          <GatewayPicker
            value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
            onChange={({ gatewayId: nextId, gatewayPoolId: nextPoolId }) => {
              setValue("inputs.gatewayId", nextId ?? undefined, { shouldDirty: true });
              setValue("inputs.gatewayPoolId", nextPoolId ?? undefined, { shouldDirty: true });
            }}
          />
        </Field>
        <ProviderFields fields={connectionFields} />
      </ProviderGroup>

      <ProviderGroup
        id="milvus-privileges"
        surface
        title="Privileges"
        description="Privileges granted to the ephemeral role assigned to the lease user."
      >
        <Stack gap={12}>
          {privileges.fields.map(({ id }, index) => (
            <div key={id} className="flex items-end gap-3">
              <div className="grid flex-1 grid-cols-1 items-start gap-3 sm:grid-cols-4">
                <Controller
                  control={control}
                  name={`inputs.privileges.${index}.objectType`}
                  render={({ field, fieldState: { error } }) => (
                    <Field wide label="Object Type" error={fieldError(error)}>
                      <Select
                        value={field.value}
                        invalid={Boolean(error)}
                        options={[...MILVUS_OBJECT_TYPES]}
                        onValueChange={(value) => {
                          if (!value || value === field.value) return;
                          field.onChange(value);
                        }}
                      />
                    </Field>
                  )}
                />
                {(["objectName", "privilege", "dbName"] as const).map((key) => (
                  <Controller
                    key={key}
                    control={control}
                    name={`inputs.privileges.${index}.${key}`}
                    render={({ field, fieldState: { error } }) => (
                      <Field
                        wide
                        label={privilegeLabels[key]}
                        optional={key === "dbName"}
                        error={fieldError(error)}
                      >
                        <Input
                          ref={field.ref}
                          name={field.name}
                          value={field.value ?? ""}
                          placeholder={privilegePlaceholders[key]}
                          invalid={Boolean(error)}
                          onBlur={field.onBlur}
                          onChange={field.onChange}
                        />
                      </Field>
                    )}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                icon="trash"
                iconOnly
                aria-label={`Remove privilege ${index + 1}`}
                onClick={() => privileges.remove(index)}
              >
                {`Remove privilege ${index + 1}`}
              </Button>
            </div>
          ))}
          <div>
            <Button
              variant="outline"
              type="button"
              size="sm"
              icon="plus"
              onClick={() =>
                privileges.append({
                  objectType: "Collection",
                  objectName: "*",
                  privilege: "",
                  dbName: undefined
                })
              }
            >
              Add Privilege
            </Button>
          </div>
        </Stack>
      </ProviderGroup>

      <ProviderGroup id="milvus-advanced" presentation="collapse" title="Advanced">
        <ProviderFields fields={trailingFields} />
        <SslRejectUnauthorizedField />
      </ProviderGroup>
      {mode === "edit" && <MetadataFields id="milvus-metadata" />}
    </>
  );
}

export const milvusFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.Milvus,
  label: "Milvus",
  schema: milvusCreateFormSchema,
  getDefaultValues: getMilvusCreateDefaultValues,
  toPayload: getMilvusCreatePayload,
  Renderer: MilvusFields,
  submitLabel: "Submit",
  edit: {
    schema: milvusEditFormSchema,
    getDefaultValues: getMilvusEditDefaultValues,
    toPayload: getMilvusEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
