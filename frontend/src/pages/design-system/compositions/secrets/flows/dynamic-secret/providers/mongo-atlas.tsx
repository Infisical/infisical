import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import {
  getMongoAtlasCreateDefaultValues,
  getMongoAtlasCreatePayload,
  mongoAtlasCreateFormSchema,
  type TMongoAtlasCreateValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/mongoAtlasContract";
import type {
  TDynamicSecretProviderField,
  TDynamicSecretProviderFormItem
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { Button } from "@app/components/v4/ui/button";
import { Field, FieldDescription, FieldLegend, FieldSet } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  fieldError,
  ProviderFields,
  ProviderGroup,
  usernameTemplateFieldDefinition
} from "../fields";
import { defineFlowProvider } from "../types";

const MONGO_ATLAS_SCOPE_TYPES = [
  { label: "Cluster", value: "CLUSTER" },
  { label: "Data Lake", value: "DATA_LAKE" },
  { label: "Stream", value: "STREAM" }
] as const;

const mongoAtlasCredentialFields = [
  {
    name: "inputs.adminPublicKey",
    type: "text",
    label: "Admin Public Key",
    placeholder: "Enter Atlas public key",
    layout: "half"
  },
  {
    name: "inputs.adminPrivateKey",
    type: "secret",
    label: "Admin Private Key",
    placeholder: "Enter Atlas private key",
    autoComplete: "new-password",
    layout: "half"
  },
  {
    name: "inputs.groupId",
    type: "text",
    label: "Group/Project ID",
    placeholder: "507f1f77bcf86cd799439011",
    description: "Unique 24-hexadecimal digit string that identifies your project."
  }
] satisfies readonly TDynamicSecretProviderField<TMongoAtlasCreateValues>[];

const mongoAtlasFields = [
  {
    kind: "group",
    id: "mongo-atlas-credentials",
    presentation: "panel",
    fields: mongoAtlasCredentialFields
  }
] satisfies readonly TDynamicSecretProviderFormItem<TMongoAtlasCreateValues>[];

const usernameTemplateField = [
  usernameTemplateFieldDefinition
] satisfies readonly TDynamicSecretProviderField<TMongoAtlasCreateValues>[];

function MongoAtlasFields() {
  const { control, getValues, setValue } = useFormContext<TMongoAtlasCreateValues>();
  const roleFields = useFieldArray({ control, name: "inputs.roles" });
  const scopeFields = useFieldArray({ control, name: "inputs.scopes" });

  return (
    <>
      <ProviderGroup
        id="mongo-atlas-roles"
        presentation="panel"
        surface
        title="Roles"
        description="A role may be custom or built in: atlasAdmin, backup, clusterMonitor, dbAdmin, dbAdminAnyDatabase, enableSharding, read, readAnyDatabase, readWrite, or readWriteAnyDatabase."
      >
        <Stack gap={12} align="start">
          {roleFields.fields.map(({ id }, index) => (
            <div key={id} className="grid w-full grid-cols-3 items-start gap-3">
              <Controller
                control={control}
                name={`inputs.roles.${index}.databaseName`}
                render={({ field, fieldState: { error } }) => (
                  <Field label="Database Name" error={fieldError(error)}>
                    <Input {...field} invalid={Boolean(error)} />
                  </Field>
                )}
              />
              <Controller
                control={control}
                name={`inputs.roles.${index}.collectionName`}
                render={({ field, fieldState: { error } }) => (
                  <Field label="Collection" optional error={fieldError(error)}>
                    <Input {...field} value={field.value ?? ""} invalid={Boolean(error)} />
                  </Field>
                )}
              />
              <Controller
                control={control}
                name={`inputs.roles.${index}.roleName`}
                render={({ field, fieldState: { error } }) => (
                  <Field label="Role" error={fieldError(error)}>
                    <Inline gap={8} align="start" wrap={false}>
                      <div className="min-w-0 flex-1">
                        <Input {...field} invalid={Boolean(error)} />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        icon="trash"
                        iconOnly
                        aria-label={`Remove role ${index + 1}`}
                        onClick={() => {
                          const roles = getValues("inputs.roles");
                          if (roles && roles.length > 1) {
                            roleFields.remove(index);
                          } else {
                            setValue("inputs.roles", [{ databaseName: "", roleName: "" }], {
                              shouldDirty: true
                            });
                          }
                        }}
                      />
                    </Inline>
                  </Field>
                )}
              />
            </div>
          ))}
          <Button
            variant="outline"
            type="button"
            size="sm"
            icon="plus"
            onClick={() => roleFields.append({ databaseName: "", roleName: "" })}
          >
            Add Role
          </Button>
        </Stack>
      </ProviderGroup>

      <ProviderGroup id="mongo-atlas-advanced" presentation="collapse" title="Advanced">
        <ProviderFields fields={usernameTemplateField} />
        <FieldSet>
          <FieldLegend variant="label">Scopes (optional)</FieldLegend>
          <FieldDescription>
            Limit this database user to selected clusters, MongoDB Atlas Data Lakes, or MongoDB
            Atlas Streams instances. If omitted, MongoDB Cloud grants access to all of them in the
            project.
          </FieldDescription>
          <Stack gap={12} align="start">
            {scopeFields.fields.map(({ id }, index) => (
              <div key={id} className="grid w-full grid-cols-2 items-start gap-3">
                <Controller
                  control={control}
                  name={`inputs.scopes.${index}.name`}
                  render={({ field, fieldState: { error } }) => (
                    <Field
                      label="Label"
                      description="Human-readable label for the cluster or MongoDB Atlas Data Lake this user can access."
                      error={fieldError(error)}
                    >
                      <Input
                        {...field}
                        placeholder="Cluster or data lake ID"
                        invalid={Boolean(error)}
                      />
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name={`inputs.scopes.${index}.type`}
                  render={({ field, fieldState: { error } }) => (
                    <Field label="Type" error={fieldError(error)}>
                      <Inline gap={8} align="start" wrap={false}>
                        <div className="min-w-0 flex-1">
                          <Select
                            value={field.value}
                            invalid={Boolean(error)}
                            options={MONGO_ATLAS_SCOPE_TYPES}
                            onValueChange={(value) => {
                              if (!value || value === field.value) return;
                              field.onChange(value);
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          icon="trash"
                          iconOnly
                          aria-label={`Remove scope ${index + 1}`}
                          onClick={() => scopeFields.remove(index)}
                        />
                      </Inline>
                    </Field>
                  )}
                />
              </div>
            ))}
            <Button
              variant="outline"
              type="button"
              size="sm"
              icon="plus"
              onClick={() =>
                scopeFields.append({ name: "", type: MONGO_ATLAS_SCOPE_TYPES[0].value })
              }
            >
              Add Scope
            </Button>
          </Stack>
        </FieldSet>
      </ProviderGroup>
    </>
  );
}

export const mongoAtlasFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.MongoAtlas,
  label: "MongoDB Atlas",
  schema: mongoAtlasCreateFormSchema,
  getDefaultValues: getMongoAtlasCreateDefaultValues,
  toPayload: getMongoAtlasCreatePayload,
  fields: mongoAtlasFields,
  Renderer: MongoAtlasFields,
  submitLabel: "Submit"
});
