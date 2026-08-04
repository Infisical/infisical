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

const connectionFields = [
  { name: "inputs.host", type: "text", label: "Host", layout: "half" },
  { name: "inputs.port", type: "number", label: "Port", isOptional: true, layout: "half" },
  { name: "inputs.username", type: "text", label: "User", layout: "half" },
  {
    name: "inputs.password",
    type: "secret",
    label: "Password",
    autoComplete: "new-password",
    layout: "half"
  },
  { name: "inputs.database", type: "text", label: "Database" },
  { name: "inputs.ca", type: "secret", label: "CA (SSL)", isOptional: true }
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
  const { control } = useFormContext<TMongoDbCreateValues | TMongoDbEditValues>();
  const roles = useFieldArray({ control, name: "inputs.roles" });
  return (
    <>
      <DynamicSecretProviderGroup id="mongodb-connection" presentation="panel">
        <DynamicSecretProviderFields fields={connectionFields} />
        <SslRejectUnauthorizedField
          id="mongodb-ssl-reject"
          fallbackChecked={false}
          layout="labeled"
        />
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup id="mongodb-roles" presentation="panel" surface title="Roles">
        <div className="flex flex-col gap-3">
          {roles.fields.map(({ id }, i) => (
            <div
              key={id}
              className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <Controller
                control={control}
                name={`inputs.roles.${i}.roleName`}
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={`mongodb-role-${i}`}>Role</FieldLabel>
                    <Input
                      {...field}
                      id={`mongodb-role-${i}`}
                      isError={Boolean(error)}
                      aria-describedby={error ? `mongodb-role-${i}-error` : undefined}
                    />
                    <FieldError id={`mongodb-role-${i}-error`}>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <div className="flex flex-col gap-2">
                <FieldLabel className="invisible pointer-events-none select-none" aria-hidden>
                  &nbsp;
                </FieldLabel>
                <IconButton
                  type="button"
                  variant="outline"
                  aria-label={`Remove role ${i + 1}`}
                  onClick={() => roles.remove(i)}
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
  customRenderer: { reasons: ["repeatable-fields"], Component: MongoDbFields },
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
