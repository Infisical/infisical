import { Controller, useFormContext } from "react-hook-form";
import { Field } from "@infisical/cipher/ui/field";

import {
  getVerticaCreateDefaultValues,
  getVerticaCreatePayload,
  getVerticaEditDefaultValues,
  getVerticaEditPayload,
  type TVerticaCreateFormValues,
  type TVerticaEditFormValues,
  verticaCreateFormSchema,
  verticaEditFormSchema
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/verticaContract";
import { normalizeDynamicSecretGatewayValueForMode } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/schemas";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { fieldError, GatewayPicker, ProviderFields, ProviderGroup } from "../fields";
import { defineFlowProvider, type DynamicSecretRendererProps } from "../types";

const connectionFields = [
  {
    name: "inputs.host",
    type: "text",
    label: "Host",
    placeholder: "vertica.example.com",
    layout: "half"
  },
  { name: "inputs.port", type: "number", label: "Port", layout: "half" },
  {
    name: "inputs.database",
    type: "text",
    label: "Database",
    placeholder: "VMart",
    layout: "half"
  },
  {
    name: "inputs.username",
    type: "text",
    label: "User",
    placeholder: "dbadmin",
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
  }
] satisfies readonly TDynamicSecretProviderField<TVerticaCreateFormValues>[];

const statementFields = [
  {
    name: "usernameTemplate",
    type: "text",
    label: "Username Template",
    placeholder: "{{randomUsername}}"
  },
  { name: "inputs.creationStatement", type: "textarea", label: "Creation Statement", rows: 3 },
  {
    name: "inputs.revocationStatement",
    type: "textarea",
    label: "Revocation Statement",
    rows: 3
  }
] satisfies readonly TDynamicSecretProviderField<TVerticaCreateFormValues>[];

const passwordRequirementFields = [
  {
    name: "inputs.passwordRequirements.length",
    type: "number",
    label: "Password Length"
  },
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
] satisfies readonly TDynamicSecretProviderField<TVerticaCreateFormValues>[];

function VerticaFields({ mode }: Pick<DynamicSecretRendererProps, "mode">) {
  const { control, setValue, watch } = useFormContext<
    TVerticaCreateFormValues | TVerticaEditFormValues
  >();
  const gatewayId = watch("inputs.gatewayId");
  const gatewayPoolId = watch("inputs.gatewayPoolId");

  return (
    <>
      <ProviderGroup id="vertica-connection">
        <Controller
          control={control}
          name="inputs.gatewayId"
          render={({ fieldState: { error } }) => (
            <Field wide label="Gateway" error={fieldError(error)}>
              <GatewayPicker
                invalid={Boolean(error)}
                value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                onChange={({ gatewayId: nextGatewayId, gatewayPoolId: nextGatewayPoolId }) => {
                  setValue(
                    "inputs.gatewayId",
                    normalizeDynamicSecretGatewayValueForMode(mode, nextGatewayId),
                    { shouldDirty: true }
                  );
                  setValue(
                    "inputs.gatewayPoolId",
                    normalizeDynamicSecretGatewayValueForMode(mode, nextGatewayPoolId),
                    { shouldDirty: true }
                  );
                }}
              />
            </Field>
          )}
        />
        <ProviderFields fields={connectionFields} />
      </ProviderGroup>

      <ProviderGroup id="vertica-statements" presentation="collapse" title="Modify SQL Statements">
        <ProviderFields fields={statementFields} />
      </ProviderGroup>

      <ProviderGroup
        id="vertica-password"
        presentation="collapse"
        title="Password Configuration (optional)"
      >
        <ProviderFields fields={passwordRequirementFields} />
      </ProviderGroup>
    </>
  );
}

export const verticaFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.Vertica,
  label: "Vertica",
  schema: verticaCreateFormSchema,
  getDefaultValues: getVerticaCreateDefaultValues,
  toPayload: getVerticaCreatePayload,
  Renderer: VerticaFields,
  submitLabel: "Submit",
  edit: {
    schema: verticaEditFormSchema,
    getDefaultValues: getVerticaEditDefaultValues,
    toPayload: getVerticaEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
