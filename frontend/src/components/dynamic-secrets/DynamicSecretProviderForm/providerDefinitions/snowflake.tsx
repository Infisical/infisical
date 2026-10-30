import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { buildStatementFields, StatementAccordion } from "../shared";
import { defineDynamicSecretProvider } from "../types";
import {
  getSnowflakeCreateDefaultValues,
  getSnowflakeCreatePayload,
  getSnowflakeEditDefaultValues,
  getSnowflakeEditPayload,
  SNOWFLAKE_CUSTOM_RENDERER_REASONS,
  snowflakeCreateFormSchema,
  snowflakeEditFormSchema
} from "./snowflakeContract";

const snowflakeConnectionFields = [
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
] as const;

const snowflakeAdvancedFields = buildStatementFields();

const SnowflakeFields = () => (
  <>
    <DynamicSecretProviderGroup id="snowflake-connection" presentation="panel">
      <DynamicSecretProviderFields fields={snowflakeConnectionFields} />
    </DynamicSecretProviderGroup>
    <StatementAccordion title="Modify SQL Statements" fields={snowflakeAdvancedFields} />
  </>
);

export const snowflakeDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Snowflake,
  label: "Snowflake",
  customRenderer: {
    reasons: SNOWFLAKE_CUSTOM_RENDERER_REASONS,
    Component: SnowflakeFields
  },
  create: {
    schema: snowflakeCreateFormSchema,
    getDefaultValues: getSnowflakeCreateDefaultValues,
    toPayload: getSnowflakeCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: snowflakeEditFormSchema,
    getDefaultValues: getSnowflakeEditDefaultValues,
    toPayload: getSnowflakeEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
