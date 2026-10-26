import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import {
  clickHouseCreateFormSchema,
  getClickHouseCreateDefaultValues,
  getClickHouseCreatePayload,
  type TClickHouseFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/clickHouseContract";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { Button } from "@app/components/v4/ui/button";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@app/components/v4/ui/empty";
import { Field, FieldDescription } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { fieldError, GatewayPicker, ProviderFields, ProviderGroup } from "../fields";
import { defineFlowProvider } from "../types";

const connectionFields = [
  {
    name: "inputs.host",
    type: "text",
    label: "Host",
    placeholder: "https://your-host.clickhouse.cloud",
    layout: "half"
  },
  { name: "inputs.port", type: "number", label: "Port", layout: "half" },
  {
    name: "inputs.username",
    type: "text",
    label: "User",
    placeholder: "default",
    autoComplete: "off",
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
  { name: "inputs.database", type: "text", label: "Database", placeholder: "default" },
  {
    name: "inputs.ca",
    type: "secret",
    label: "CA (SSL)",
    placeholder: "-----BEGIN CERTIFICATE----- ...",
    description: "Optionally needed for self-signed certificates.",
    isOptional: true
  }
] satisfies readonly TDynamicSecretProviderField<TClickHouseFormValues>[];

const statementFields = [
  {
    name: "usernameTemplate",
    type: "text",
    label: "Username Template",
    placeholder: "{{randomUsername}}"
  },
  { name: "inputs.creationStatement", type: "textarea", label: "Creation Statement", rows: 3 },
  { name: "inputs.revocationStatement", type: "textarea", label: "Revocation Statement", rows: 3 },
  { name: "inputs.renewStatement", type: "textarea", label: "Renew Statement", rows: 3 }
] satisfies readonly TDynamicSecretProviderField<TClickHouseFormValues>[];

const passwordRequirementFields = [
  { name: "inputs.passwordRequirements.length", type: "number", label: "Password Length" },
  {
    name: "inputs.passwordRequirements.required.lowercase",
    type: "number",
    label: "Lowercase Count",
    layout: "half"
  },
  {
    name: "inputs.passwordRequirements.required.uppercase",
    type: "number",
    label: "Uppercase Count",
    layout: "half"
  },
  {
    name: "inputs.passwordRequirements.required.digits",
    type: "number",
    label: "Digit Count",
    layout: "half"
  },
  {
    name: "inputs.passwordRequirements.required.symbols",
    type: "number",
    label: "Symbol Count",
    layout: "half"
  },
  {
    name: "inputs.passwordRequirements.allowedSymbols",
    type: "text",
    label: "Allowed Symbols",
    isOptional: true
  }
] satisfies readonly TDynamicSecretProviderField<TClickHouseFormValues>[];

const ClickHouseMetadataFields = () => {
  const { control } = useFormContext<TClickHouseFormValues>();
  const metadata = useFieldArray({ control, name: "metadata" });
  const addEntry = (
    <Button
      variant="outline"
      type="button"
      size="sm"
      icon="plus"
      onClick={() => metadata.append({ key: "", value: "" })}
    >
      Add entry
    </Button>
  );
  return (
    <ProviderGroup id="clickhouse-metadata" surface title="Metadata">
      {metadata.fields.length === 0 ? (
        <Empty size="sm">
          <EmptyHeader>
            <EmptyTitle>No metadata entries</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>{addEntry}</EmptyContent>
        </Empty>
      ) : (
        <Stack gap={12}>
          {metadata.fields.map(({ id }, index) => (
            <div key={id} className="flex items-end gap-3">
              <div className="grid flex-1 grid-cols-2 gap-3">
                <Controller
                  control={control}
                  name={`metadata.${index}.key`}
                  render={({ field, fieldState: { error } }) => (
                    <Field label="Key" error={fieldError(error)}>
                      <Input {...field} invalid={Boolean(error)} />
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name={`metadata.${index}.value`}
                  render={({ field, fieldState: { error } }) => (
                    <Field label="Value" optional error={fieldError(error)}>
                      <Input {...field} invalid={Boolean(error)} />
                    </Field>
                  )}
                />
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
          <div>{addEntry}</div>
        </Stack>
      )}
    </ProviderGroup>
  );
};

const ClickHouseFields = () => {
  const { control, setValue, watch } = useFormContext<TClickHouseFormValues>();
  const gatewayId = watch("inputs.gatewayId");
  const gatewayPoolId = watch("inputs.gatewayPoolId");
  return (
    <>
      <ProviderGroup id="clickhouse-connection">
        <Controller
          control={control}
          name="inputs.gatewayId"
          render={({ fieldState: { error } }) => (
            <Field label="Gateway" error={fieldError(error)}>
              <GatewayPicker
                invalid={Boolean(error)}
                value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                onChange={({ gatewayId: nextId, gatewayPoolId: nextPoolId }) => {
                  setValue("inputs.gatewayId", nextId ?? undefined, { shouldDirty: true });
                  setValue("inputs.gatewayPoolId", nextPoolId ?? undefined, {
                    shouldDirty: true
                  });
                }}
              />
            </Field>
          )}
        />
        <ProviderFields fields={connectionFields} />
      </ProviderGroup>

      <ProviderGroup
        id="clickhouse-statements"
        presentation="collapse"
        title="Modify SQL Statements"
      >
        <ProviderFields fields={statementFields} />
      </ProviderGroup>

      <ProviderGroup
        id="clickhouse-password"
        presentation="collapse"
        title="Password Configuration (optional)"
      >
        <FieldDescription>Set constraints on the generated database password.</FieldDescription>
        <ProviderFields fields={passwordRequirementFields} />
      </ProviderGroup>

      <ClickHouseMetadataFields />
    </>
  );
};

export const clickHouseFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.Clickhouse,
  label: "ClickHouse",
  schema: clickHouseCreateFormSchema,
  getDefaultValues: getClickHouseCreateDefaultValues,
  toPayload: getClickHouseCreatePayload,
  Renderer: ClickHouseFields,
  submitLabel: "Submit"
});
