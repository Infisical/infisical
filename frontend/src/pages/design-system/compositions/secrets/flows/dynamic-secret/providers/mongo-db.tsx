import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import {
  getMongoDbCreateDefaultValues,
  getMongoDbCreatePayload,
  mongoDbCreateFormSchema,
  type TMongoDbCreateValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/mongoDbContract";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  fieldError,
  ProviderFields,
  ProviderGroup,
  SslRejectUnauthorizedField,
  usernameTemplateFieldDefinition
} from "../fields";
import { defineFlowProvider } from "../types";

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
] satisfies readonly TDynamicSecretProviderField<TMongoDbCreateValues>[];

const usernameTemplateField = [
  usernameTemplateFieldDefinition
] satisfies readonly TDynamicSecretProviderField<TMongoDbCreateValues>[];

function MongoDbFields() {
  const { control, getValues, setValue } = useFormContext<TMongoDbCreateValues>();
  const roles = useFieldArray({ control, name: "inputs.roles" });

  return (
    <>
      <ProviderGroup id="mongodb-connection" presentation="panel">
        <ProviderFields fields={mongoDbConnectionFields} />
        <SslRejectUnauthorizedField<TMongoDbCreateValues> fallbackChecked={false} />
      </ProviderGroup>

      <ProviderGroup
        id="mongodb-roles"
        presentation="panel"
        surface
        title="Roles"
        description="A role may be custom or built in: atlasAdmin, backup, clusterMonitor, dbAdmin, dbAdminAnyDatabase, enableSharding, read, readAnyDatabase, readWrite, or readWriteAnyDatabase."
      >
        <Stack gap={12} align="start">
          {roles.fields.map(({ id }, index) => (
            <Controller
              key={id}
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
                        const currentRoles = getValues("inputs.roles");
                        if (currentRoles && currentRoles.length > 1) {
                          roles.remove(index);
                        } else {
                          setValue("inputs.roles", [{ roleName: "" }], { shouldDirty: true });
                        }
                      }}
                    />
                  </Inline>
                </Field>
              )}
            />
          ))}
          <Button
            variant="outline"
            type="button"
            size="sm"
            icon="plus"
            onClick={() => roles.append({ roleName: "" })}
          >
            Add Role
          </Button>
        </Stack>
      </ProviderGroup>

      <ProviderGroup id="mongodb-advanced" presentation="collapse" title="Advanced">
        <ProviderFields fields={usernameTemplateField} />
      </ProviderGroup>
    </>
  );
}

export const mongoDbFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.MongoDB,
  label: "MongoDB",
  schema: mongoDbCreateFormSchema,
  getDefaultValues: getMongoDbCreateDefaultValues,
  toPayload: getMongoDbCreatePayload,
  Renderer: MongoDbFields,
  submitLabel: "Submit"
});
