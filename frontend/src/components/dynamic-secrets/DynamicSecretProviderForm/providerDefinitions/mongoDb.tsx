import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button, Field, FieldError, FieldLabel, IconButton, Input } from "@app/components/v3";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import { SslRejectUnauthorizedField } from "../shared";
import { defineDynamicSecretProvider, TDynamicSecretProviderField } from "../types";
import {
  getMongoDbCreateDefaultValues,
  getMongoDbCreatePayload,
  getMongoDbEditDefaultValues,
  getMongoDbEditPayload,
  mongoDbCreateFormSchema,
  mongoDbEditFormSchema,
  TMongoDbCreateValues,
  TMongoDbEditValues
} from "./mongoDbContract";

const mongoDbConnectionFields = [
  {
    name: "inputs.host",
    type: "text",
    label: "Host",
    placeholder: "mongodb.example.com",
    layout: "half"
  },
  {
    name: "inputs.port",
    type: "number",
    label: "Port",
    placeholder: "27017",
    isOptional: true,
    layout: "half"
  },
  {
    name: "inputs.username",
    type: "text",
    label: "User",
    placeholder: "admin",
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
  { name: "inputs.database", type: "text", label: "Database", placeholder: "admin" },
  {
    name: "inputs.ca",
    type: "secret",
    label: "CA (SSL)",
    placeholder: "-----BEGIN CERTIFICATE----- ...",
    isOptional: true
  }
] satisfies readonly TDynamicSecretProviderField<TMongoDbCreateValues | TMongoDbEditValues>[];

const usernameTemplateField = [
  {
    name: "usernameTemplate",
    type: "text",
    label: "Username Template",
    placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
  }
] satisfies readonly TDynamicSecretProviderField<TMongoDbCreateValues | TMongoDbEditValues>[];

const MongoDbFields = () => {
  const { control, getValues, setValue } = useFormContext<
    TMongoDbCreateValues | TMongoDbEditValues
  >();
  const roles = useFieldArray({ control, name: "inputs.roles" });

  return (
    <>
      <DynamicSecretProviderGroup id="mongodb-connection" presentation="panel">
        <DynamicSecretProviderFields fields={mongoDbConnectionFields} />
        <SslRejectUnauthorizedField
          id="mongodb-ssl-reject-unauthorized"
          fallbackChecked={false}
          layout="labeled"
        />
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup
        id="mongodb-roles"
        presentation="panel"
        surface
        title="Roles"
        description="A role may be custom or built in: atlasAdmin, backup, clusterMonitor, dbAdmin, dbAdminAnyDatabase, enableSharding, read, readAnyDatabase, readWrite, or readWriteAnyDatabase."
      >
        <div className="flex flex-col gap-3">
          {roles.fields.map(({ id }, index) => (
            <div
              key={id}
              className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <Controller
                control={control}
                name={`inputs.roles.${index}.roleName`}
                render={({ field, fieldState: { error } }) => {
                  const errorId = `mongodb-role-${index}-error`;

                  return (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`mongodb-role-${index}`}>Role</FieldLabel>
                      <Input
                        {...field}
                        id={`mongodb-role-${index}`}
                        isError={Boolean(error)}
                        aria-describedby={error ? errorId : undefined}
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
                    const currentRoles = getValues("inputs.roles");
                    if (currentRoles && currentRoles.length > 1) {
                      roles.remove(index);
                    } else {
                      setValue("inputs.roles", [{ roleName: "" }], { shouldDirty: true });
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
            onClick={() => roles.append({ roleName: "" })}
          >
            <PlusIcon />
            Add Role
          </Button>
        </div>
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup id="mongodb-advanced" presentation="collapse" title="Advanced">
        <DynamicSecretProviderFields fields={usernameTemplateField} />
      </DynamicSecretProviderGroup>
    </>
  );
};

export const mongoDbDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.MongoDB,
  label: "MongoDB",
  customRenderer: {
    reasons: ["repeatable-fields"],
    Component: MongoDbFields
  },
  create: {
    schema: mongoDbCreateFormSchema,
    getDefaultValues: getMongoDbCreateDefaultValues,
    toPayload: getMongoDbCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: mongoDbEditFormSchema,
    getDefaultValues: getMongoDbEditDefaultValues,
    toPayload: getMongoDbEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
