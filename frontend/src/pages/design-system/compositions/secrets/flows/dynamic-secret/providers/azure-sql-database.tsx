import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import {
  azureSqlCreateFormSchema,
  getAzureSqlCreateDefaultValues,
  getAzureSqlCreatePayload,
  normalizeAzureSqlGatewayValueForMode,
  type TAzureSqlCreateValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/azureSqlDatabaseContract";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/schemas";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Switch } from "@app/components/v4/ui/switch";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  fieldError,
  GatewayPicker,
  numberInput,
  ProviderFields,
  ProviderGroup,
  SslRejectUnauthorizedField
} from "../fields";
import { defineFlowProvider } from "../types";

const scalarFields = [
  {
    name: "inputs.host",
    type: "text",
    label: "Host",
    placeholder: "server.database.windows.net"
  },
  {
    name: "inputs.username",
    type: "text",
    label: "User",
    placeholder: "database-admin",
    layout: "half"
  },
  {
    name: "inputs.database",
    type: "text",
    label: "Database",
    placeholder: "app-db",
    layout: "half"
  }
] satisfies readonly TDynamicSecretProviderField<TAzureSqlCreateValues>[];

const caFields = [
  {
    name: "inputs.ca",
    type: "secret",
    label: "CA (SSL)",
    placeholder: "-----BEGIN CERTIFICATE----- ...",
    isOptional: true
  }
] satisfies readonly TDynamicSecretProviderField<TAzureSqlCreateValues>[];

const statementFields = [
  {
    name: "usernameTemplate",
    type: "text",
    label: "Username Template",
    placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
  },
  {
    name: "inputs.masterCreationStatement",
    type: "textarea",
    label: "Master Creation Statement",
    description: "Statement to create login in master database",
    rows: 3
  },
  {
    name: "inputs.creationStatement",
    type: "textarea",
    label: "Creation Statement",
    description: "Statement to create user in target database and grant permissions",
    rows: 3
  },
  {
    name: "inputs.revocationStatement",
    type: "textarea",
    label: "Revocation Statement",
    description: "Statement to drop user and login",
    rows: 3
  },
  {
    name: "inputs.renewStatement",
    type: "textarea",
    label: "Renew Statement",
    description: "username and expiration are dynamically provisioned",
    isOptional: true,
    rows: 3
  }
] satisfies readonly TDynamicSecretProviderField<TAzureSqlCreateValues>[];

const countFields = [
  ["lowercase", "Lowercase Count", "Minimum number of lowercase letters"],
  ["uppercase", "Uppercase Count", "Minimum number of uppercase letters"],
  ["digits", "Digit Count", "Minimum number of digits"],
  ["symbols", "Symbol Count", "Minimum number of symbols"]
] as const;

const AzureSqlMetadataFields = () => {
  const { control } = useFormContext<TAzureSqlCreateValues>();
  const metadata = useFieldArray({ control, name: "metadata" });
  return (
    <ProviderGroup id="azure-sql-metadata" surface title="Metadata">
      <Stack gap={12}>
        {metadata.fields.map(({ id }, index) => (
          <div key={id} className="flex items-end gap-3">
            <div className="grid flex-1 grid-cols-2 gap-3">
              {(["key", "value"] as const).map((key) => (
                <Controller
                  key={key}
                  control={control}
                  name={`metadata.${index}.${key}`}
                  render={({ field, fieldState: { error } }) => (
                    <Field
                      label={key === "key" ? "Key" : "Value"}
                      optional={key === "value"}
                      error={fieldError(error)}
                    >
                      <Input {...field} invalid={Boolean(error)} />
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
              aria-label={`Remove metadata entry ${index + 1}`}
              onClick={() => metadata.remove(index)}
            />
          </div>
        ))}
        <div>
          <Button
            variant="outline"
            type="button"
            size="sm"
            icon="plus"
            onClick={() => metadata.append({ key: "", value: "" })}
          >
            Add metadata
          </Button>
        </div>
      </Stack>
    </ProviderGroup>
  );
};

const AzureSqlPasswordRequirements = () => {
  const { control } = useFormContext<TAzureSqlCreateValues>();
  return (
    <div className="grid grid-cols-2 gap-4">
      <Controller
        control={control}
        name="inputs.passwordRequirements.length"
        render={({ field, fieldState: { error } }) => (
          <Field label="Password Length" error={fieldError(error)}>
            <Input
              ref={field.ref}
              name={field.name}
              type="number"
              min={1}
              max={250}
              value={field.value ?? ""}
              invalid={Boolean(error)}
              onBlur={field.onBlur}
              onChange={(event) => field.onChange(numberInput(event.currentTarget.value))}
            />
          </Field>
        )}
      />
      {countFields.map(([key, label, description]) => (
        <Controller
          key={key}
          control={control}
          name={`inputs.passwordRequirements.required.${key}`}
          render={({ field, fieldState: { error } }) => (
            <Field label={label} description={description} error={fieldError(error)}>
              <Input
                ref={field.ref}
                name={field.name}
                type="number"
                min={0}
                value={field.value ?? ""}
                invalid={Boolean(error)}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(numberInput(event.currentTarget.value))}
              />
            </Field>
          )}
        />
      ))}
      <Controller
        control={control}
        name="inputs.passwordRequirements.allowedSymbols"
        render={({ field, fieldState: { error } }) => (
          <Field
            className="col-span-2"
            label="Symbols to use in password"
            description="Default: -_.~!*"
            error={fieldError(error)}
          >
            <Input {...field} value={field.value ?? ""} invalid={Boolean(error)} />
          </Field>
        )}
      />
    </div>
  );
};

const AzureSqlFields = () => {
  const { control, setValue, watch } = useFormContext<TAzureSqlCreateValues>();
  const sslEnabled = watch("inputs.sslEnabled");
  const gatewayId = watch("inputs.gatewayId");
  const gatewayPoolId = watch("inputs.gatewayPoolId");
  return (
    <>
      <ProviderGroup id="azure-sql-connection">
        <Controller
          control={control}
          name="inputs.gatewayId"
          render={({ field, fieldState: { error } }) => (
            <Field label="Gateway" error={fieldError(error)}>
              <GatewayPicker
                invalid={Boolean(error)}
                value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                onChange={({ gatewayId: nextId, gatewayPoolId: nextPoolId }) => {
                  field.onChange(normalizeAzureSqlGatewayValueForMode("create", nextId));
                  setValue(
                    "inputs.gatewayPoolId",
                    normalizeAzureSqlGatewayValueForMode("create", nextPoolId) ?? undefined,
                    { shouldDirty: true }
                  );
                }}
              />
            </Field>
          )}
        />
        <ProviderFields fields={scalarFields} />
        <Controller
          control={control}
          name="inputs.port"
          render={({ field, fieldState: { error } }) => (
            <Field label="Port" error={fieldError(error)}>
              <Input
                ref={field.ref}
                name={field.name}
                type="number"
                value={field.value ?? ""}
                invalid={Boolean(error)}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(numberInput(event.currentTarget.value))}
              />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="inputs.password"
          render={({ field, fieldState: { error } }) => (
            <Field label="Password" error={fieldError(error)}>
              <Input
                {...field}
                type="password"
                value={field.value ?? ""}
                placeholder="Enter database password"
                invalid={Boolean(error)}
              />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="inputs.sslEnabled"
          render={({ field }) => (
            <Switch
              ref={field.ref}
              layout="row"
              label="Enable SSL"
              description="Configure a custom CA certificate for this connection."
              checked={field.value ?? false}
              onBlur={field.onBlur}
              onCheckedChange={field.onChange}
            />
          )}
        />
        {sslEnabled && (
          <>
            <ProviderFields fields={caFields} />
            <SslRejectUnauthorizedField<TAzureSqlCreateValues> />
          </>
        )}
      </ProviderGroup>

      <AzureSqlMetadataFields />

      <ProviderGroup
        id="azure-sql-statements"
        presentation="collapse"
        title="Statements and Username Template"
      >
        <ProviderFields fields={statementFields} />
      </ProviderGroup>

      <ProviderGroup
        id="azure-sql-password"
        presentation="collapse"
        title="Password Configuration (optional)"
      >
        <AzureSqlPasswordRequirements />
      </ProviderGroup>
    </>
  );
};

export const azureSqlDatabaseFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.AzureSqlDatabase,
  label: "Azure SQL Database",
  schema: azureSqlCreateFormSchema,
  getDefaultValues: getAzureSqlCreateDefaultValues,
  toPayload: getAzureSqlCreatePayload,
  Renderer: AzureSqlFields,
  submitLabel: "Submit"
});
