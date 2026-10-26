import { Controller, useFormContext } from "react-hook-form";

import {
  getVerticaCreateDefaultValues,
  getVerticaCreatePayload,
  type TVerticaCreateFormValues,
  type TVerticaEditFormValues,
  verticaCreateFormSchema
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/verticaContract";
import { normalizeDynamicSecretGatewayValueForMode } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/schemas";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { Field } from "@app/components/v4/ui/field";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { fieldError, GatewayPicker, ProviderFields, ProviderGroup } from "../fields";
import { defineFlowProvider } from "../types";

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
    label: "Password Length",
    description: "Total generated password length."
  },
  {
    name: "inputs.passwordRequirements.required.lowercase",
    type: "number",
    label: "Lowercase Count",
    description: "Minimum number of lowercase letters.",
    layout: "half"
  },
  {
    name: "inputs.passwordRequirements.required.uppercase",
    type: "number",
    label: "Uppercase Count",
    description: "Minimum number of uppercase letters.",
    layout: "half"
  },
  {
    name: "inputs.passwordRequirements.required.digits",
    type: "number",
    label: "Digit Count",
    description: "Minimum number of digits.",
    layout: "half"
  },
  {
    name: "inputs.passwordRequirements.required.symbols",
    type: "number",
    label: "Symbol Count",
    description: "Minimum number of symbols.",
    layout: "half"
  },
  {
    name: "inputs.passwordRequirements.allowedSymbols",
    type: "text",
    label: "Allowed Symbols",
    description: "Symbols available to the password generator.",
    isOptional: true
  }
] satisfies readonly TDynamicSecretProviderField<TVerticaCreateFormValues>[];

function VerticaFields() {
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
            <Field label="Gateway" error={fieldError(error)}>
              <GatewayPicker
                invalid={Boolean(error)}
                value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                onChange={({ gatewayId: nextGatewayId, gatewayPoolId: nextGatewayPoolId }) => {
                  setValue(
                    "inputs.gatewayId",
                    normalizeDynamicSecretGatewayValueForMode("create", nextGatewayId),
                    { shouldDirty: true }
                  );
                  setValue(
                    "inputs.gatewayPoolId",
                    normalizeDynamicSecretGatewayValueForMode("create", nextGatewayPoolId),
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
        description="Set constraints on the generated database password."
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
  submitLabel: "Submit"
});
