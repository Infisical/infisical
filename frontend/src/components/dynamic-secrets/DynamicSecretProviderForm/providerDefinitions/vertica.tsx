import { Controller, useFormContext } from "react-hook-form";

import { OrgPermissionCan } from "@app/components/permissions";
import { Field, FieldDescription, FieldFeedback, FieldTitle } from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { OrgPermissionSubjects } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { normalizeDynamicSecretGatewayValueForMode } from "../schemas";
import { defineDynamicSecretProvider, TDynamicSecretProviderRendererProps } from "../types";
import {
  getVerticaCreateDefaultValues,
  getVerticaCreatePayload,
  getVerticaEditDefaultValues,
  getVerticaEditPayload,
  TVerticaCreateFormValues,
  TVerticaEditFormValues,
  VERTICA_CUSTOM_RENDERER_REASONS,
  verticaCreateFormSchema,
  verticaEditFormSchema
} from "./verticaContract";

const connectionFields = [
  { name: "inputs.host", type: "text", label: "Host", placeholder: "Vertica Host", layout: "half" },
  { name: "inputs.port", type: "number", label: "Port", layout: "half" },
  { name: "inputs.database", type: "text", label: "Database", layout: "half" },
  { name: "inputs.username", type: "text", label: "User", autoComplete: "off", layout: "half" },
  {
    name: "inputs.password",
    type: "secret",
    label: "Password",
    autoComplete: "new-password",
    layout: "half"
  }
] as const;

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
] as const;

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
] as const;

const VerticaFields = ({ mode }: TDynamicSecretProviderRendererProps) => {
  const { control, setValue, watch } = useFormContext<
    TVerticaCreateFormValues | TVerticaEditFormValues
  >();
  const gatewayId = watch("inputs.gatewayId");
  const gatewayPoolId = watch("inputs.gatewayPoolId");

  return (
    <>
      <DynamicSecretProviderGroup id="vertica-connection" presentation="panel">
        <OrgPermissionCan
          I={OrgGatewayPermissionActions.AttachGateways}
          a={OrgPermissionSubjects.Gateway}
        >
          {(isAllowed) => (
            <Controller
              control={control}
              name="inputs.gatewayId"
              render={({ fieldState: { error } }) => {
                const description = !isAllowed
                  ? "You don't have permission to attach gateways to resources."
                  : undefined;
                const hasFeedback = Boolean(description || error?.message);

                return (
                  <Field data-invalid={Boolean(error)} data-disabled={!isAllowed}>
                    <FieldTitle>Gateway</FieldTitle>
                    <GatewayPicker
                      isDisabled={!isAllowed}
                      isError={Boolean(error)}
                      value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                      onChange={({
                        gatewayId: nextGatewayId,
                        gatewayPoolId: nextGatewayPoolId
                      }) => {
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
                    {hasFeedback && (
                      <FieldFeedback
                        id="vertica-gateway-feedback"
                        description={description}
                        error={error?.message}
                      />
                    )}
                  </Field>
                );
              }}
            />
          )}
        </OrgPermissionCan>

        <DynamicSecretProviderFields fields={connectionFields} />
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup
        id="vertica-statements"
        presentation="collapse"
        title="Modify SQL Statements"
      >
        <DynamicSecretProviderFields fields={statementFields} />
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup
        id="vertica-password"
        presentation="collapse"
        title="Password Configuration (optional)"
      >
        <FieldDescription>Set constraints on the generated database password.</FieldDescription>
        <DynamicSecretProviderFields fields={passwordRequirementFields} />
      </DynamicSecretProviderGroup>
    </>
  );
};

export const verticaDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Vertica,
  label: "Vertica",
  customRenderer: {
    reasons: VERTICA_CUSTOM_RENDERER_REASONS,
    Component: VerticaFields
  },
  create: {
    schema: verticaCreateFormSchema,
    getDefaultValues: getVerticaCreateDefaultValues,
    toPayload: getVerticaCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: verticaEditFormSchema,
    getDefaultValues: getVerticaEditDefaultValues,
    toPayload: getVerticaEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
