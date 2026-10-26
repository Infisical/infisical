import {
  getSnowflakeCreateDefaultValues,
  getSnowflakeCreatePayload,
  snowflakeCreateFormSchema,
  type TSnowflakeCreateFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/snowflakeContract";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { buildStatementFields, ProviderFields, ProviderGroup, StatementAccordion } from "../fields";
import { defineFlowProvider } from "../types";

const connectionFields = [
  {
    name: "inputs.accountId",
    type: "text",
    label: "Account Identifier",
    placeholder: "my-account",
    layout: "half"
  },
  {
    name: "inputs.orgId",
    type: "text",
    label: "Organization Identifier",
    placeholder: "my-organization",
    layout: "half"
  },
  {
    name: "inputs.username",
    type: "text",
    label: "User",
    placeholder: "INFISICAL_USER",
    layout: "half"
  },
  {
    name: "inputs.password",
    type: "secret",
    label: "Programmatic Access Token",
    placeholder: "Enter programmatic access token",
    description:
      "The programmatic access token used to authenticate with Snowflake. A user password is still accepted, but Snowflake is phasing out password authentication.",
    autoComplete: "new-password",
    layout: "half"
  }
] satisfies readonly TDynamicSecretProviderField<TSnowflakeCreateFormValues>[];

const advancedFields = buildStatementFields<TSnowflakeCreateFormValues>();

function SnowflakeFields() {
  return (
    <>
      <ProviderGroup id="snowflake-connection" presentation="panel">
        <ProviderFields fields={connectionFields} />
      </ProviderGroup>
      <StatementAccordion title="Modify SQL Statements" fields={advancedFields} />
    </>
  );
}

export const snowflakeFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.Snowflake,
  label: "Snowflake",
  schema: snowflakeCreateFormSchema,
  getDefaultValues: getSnowflakeCreateDefaultValues,
  toPayload: getSnowflakeCreatePayload,
  Renderer: SnowflakeFields,
  submitLabel: "Submit"
});
