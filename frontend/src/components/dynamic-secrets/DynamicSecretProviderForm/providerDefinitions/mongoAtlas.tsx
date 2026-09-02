import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldFeedback,
  FieldLabel,
  FieldLegend,
  FieldSet,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import {
  defineDynamicSecretProvider,
  TDynamicSecretProviderField,
  TDynamicSecretProviderFormItem
} from "../types";
import {
  getMongoAtlasCreateDefaultValues,
  getMongoAtlasCreatePayload,
  getMongoAtlasEditDefaultValues,
  getMongoAtlasEditPayload,
  mongoAtlasCreateFormSchema,
  mongoAtlasEditFormSchema,
  TMongoAtlasCreateValues,
  TMongoAtlasEditValues
} from "./mongoAtlasContract";

const MONGO_ATLAS_SCOPE_TYPES = [
  { label: "Cluster", value: "CLUSTER" },
  { label: "Data Lake", value: "DATA_LAKE" },
  { label: "Stream", value: "STREAM" }
] as const;

type TMongoAtlasValues = TMongoAtlasCreateValues | TMongoAtlasEditValues;

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
] satisfies readonly TDynamicSecretProviderField<TMongoAtlasValues>[];

const mongoAtlasFields = [
  {
    kind: "group",
    id: "mongo-atlas-credentials",
    presentation: "panel",
    fields: mongoAtlasCredentialFields
  }
] satisfies readonly TDynamicSecretProviderFormItem<TMongoAtlasValues>[];

const usernameTemplateField = [
  {
    name: "usernameTemplate",
    type: "text",
    label: "Username Template",
    placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
  }
] satisfies readonly TDynamicSecretProviderField<TMongoAtlasValues>[];

const MongoAtlasFields = () => {
  const { control, getValues, setValue } = useFormContext<TMongoAtlasValues>();
  const roleFields = useFieldArray({ control, name: "inputs.roles" });
  const scopeFields = useFieldArray({ control, name: "inputs.scopes" });

  return (
    <>
      <DynamicSecretProviderGroup
        id="mongo-atlas-roles"
        presentation="panel"
        surface
        title="Roles"
        description="A role may be custom or built in: atlasAdmin, backup, clusterMonitor, dbAdmin, dbAdminAnyDatabase, enableSharding, read, readAnyDatabase, readWrite, or readWriteAnyDatabase."
      >
        <div className="flex flex-col gap-3">
          {roleFields.fields.map(({ id }, index) => (
            <div
              key={id}
              className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <Controller
                control={control}
                name={`inputs.roles.${index}.databaseName`}
                render={({ field, fieldState: { error } }) => {
                  const errorId = `mongo-atlas-role-${index}-database-error`;

                  return (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`mongo-atlas-role-${index}-database`}>
                        Database Name
                      </FieldLabel>
                      <Input
                        {...field}
                        id={`mongo-atlas-role-${index}-database`}
                        isError={Boolean(error)}
                        aria-describedby={error ? errorId : undefined}
                      />
                      {error?.message && <FieldError id={errorId}>{error.message}</FieldError>}
                    </Field>
                  );
                }}
              />
              <Controller
                control={control}
                name={`inputs.roles.${index}.collectionName`}
                render={({ field, fieldState: { error } }) => {
                  const errorId = `mongo-atlas-role-${index}-collection-error`;

                  return (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`mongo-atlas-role-${index}-collection`}>
                        Collection <span className="font-normal text-muted">(optional)</span>
                      </FieldLabel>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        id={`mongo-atlas-role-${index}-collection`}
                        isError={Boolean(error)}
                        aria-describedby={error ? errorId : undefined}
                      />
                      {error?.message && <FieldError id={errorId}>{error.message}</FieldError>}
                    </Field>
                  );
                }}
              />
              <Controller
                control={control}
                name={`inputs.roles.${index}.roleName`}
                render={({ field, fieldState: { error } }) => {
                  const errorId = `mongo-atlas-role-${index}-role-error`;

                  return (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`mongo-atlas-role-${index}-role`}>Role</FieldLabel>
                      <Input
                        {...field}
                        id={`mongo-atlas-role-${index}-role`}
                        isError={Boolean(error)}
                        aria-describedby={[
                          "mongo-atlas-roles-description",
                          error ? errorId : undefined
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      />
                      {error?.message && <FieldError id={errorId}>{error.message}</FieldError>}
                    </Field>
                  );
                }}
              />
              <div className="flex flex-col gap-2">
                <FieldLabel className="pointer-events-none invisible select-none" aria-hidden>
                  &nbsp;
                </FieldLabel>
                <IconButton
                  type="button"
                  variant="outline"
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
            onClick={() => roleFields.append({ databaseName: "", roleName: "" })}
          >
            <PlusIcon />
            Add Role
          </Button>
        </div>
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup
        id="mongo-atlas-advanced"
        presentation="collapse"
        title="Advanced"
      >
        <DynamicSecretProviderFields fields={usernameTemplateField} />
        <FieldSet>
          <FieldLegend variant="label">
            Scopes <span className="font-normal text-muted">(optional)</span>
          </FieldLegend>
          <FieldDescription id="mongo-atlas-scopes-description">
            Limit this database user to selected clusters, MongoDB Atlas Data Lakes, or MongoDB
            Atlas Streams instances. If omitted, MongoDB Cloud grants access to all of them in the
            project.
          </FieldDescription>
          <div className="flex flex-col gap-3">
            {scopeFields.fields.map(({ id }, index) => (
              <div
                key={id}
                className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <Controller
                  control={control}
                  name={`inputs.scopes.${index}.name`}
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`mongo-atlas-scope-${index}-name`}>Label</FieldLabel>
                      <Input
                        {...field}
                        id={`mongo-atlas-scope-${index}-name`}
                        placeholder="Cluster or data lake ID"
                        isError={Boolean(error)}
                        aria-describedby={`mongo-atlas-scope-${index}-name-feedback`}
                      />
                      <FieldFeedback
                        id={`mongo-atlas-scope-${index}-name-feedback`}
                        description="Human-readable label for the cluster or MongoDB Atlas Data Lake this user can access."
                        error={error?.message}
                      />
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name={`inputs.scopes.${index}.type`}
                  render={({ field, fieldState: { error } }) => {
                    const errorId = `mongo-atlas-scope-${index}-type-error`;

                    return (
                      <Field data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor={`mongo-atlas-scope-${index}-type`}>Type</FieldLabel>
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            if (!value || value === field.value) return;
                            field.onChange(value);
                          }}
                        >
                          <SelectTrigger
                            ref={field.ref}
                            id={`mongo-atlas-scope-${index}-type`}
                            onBlur={field.onBlur}
                            isError={Boolean(error)}
                            aria-describedby={error ? errorId : undefined}
                            className="w-full"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MONGO_ATLAS_SCOPE_TYPES.map((scopeType) => (
                              <SelectItem key={scopeType.value} value={scopeType.value}>
                                {scopeType.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {error?.message && <FieldError id={errorId}>{error.message}</FieldError>}
                      </Field>
                    );
                  }}
                />
                <div className="flex flex-col gap-2">
                  <FieldLabel className="pointer-events-none invisible select-none" aria-hidden>
                    &nbsp;
                  </FieldLabel>
                  <IconButton
                    type="button"
                    variant="outline"
                    aria-label={`Remove scope ${index + 1}`}
                    onClick={() => scopeFields.remove(index)}
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
                scopeFields.append({ name: "", type: MONGO_ATLAS_SCOPE_TYPES[0].value })
              }
            >
              <PlusIcon />
              Add Scope
            </Button>
          </div>
        </FieldSet>
      </DynamicSecretProviderGroup>
    </>
  );
};

export const mongoAtlasDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.MongoAtlas,
  label: "MongoDB Atlas",
  fields: mongoAtlasFields,
  customRenderer: {
    reasons: ["repeatable-fields"],
    Component: MongoAtlasFields
  },
  create: {
    schema: mongoAtlasCreateFormSchema,
    getDefaultValues: getMongoAtlasCreateDefaultValues,
    toPayload: getMongoAtlasCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: mongoAtlasEditFormSchema,
    getDefaultValues: getMongoAtlasEditDefaultValues,
    toPayload: getMongoAtlasEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
