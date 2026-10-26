import {
  cassandraCreateFormSchema,
  getCassandraCreateDefaultValues,
  getCassandraCreatePayload,
  type TCassandraFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/cassandraContract";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  buildStatementFields,
  ProviderFields,
  ProviderGroup,
  SslRejectUnauthorizedField,
  StatementAccordion
} from "../fields";
import { defineFlowProvider } from "../types";

const cassandraFields = [
  {
    name: "inputs.host",
    type: "text",
    label: "Host",
    placeholder: "cassandra-1.example.com,cassandra-2.example.com",
    layout: "half"
  },
  { name: "inputs.port", type: "number", label: "Port", layout: "half" },
  {
    name: "inputs.localDataCenter",
    type: "text",
    label: "Local Data Center",
    placeholder: "datacenter1"
  },
  {
    name: "inputs.username",
    type: "text",
    label: "User",
    placeholder: "cassandra",
    layout: "half",
    autoComplete: "off"
  },
  {
    name: "inputs.password",
    type: "secret",
    label: "Password",
    placeholder: "Enter database password",
    layout: "half",
    autoComplete: "new-password"
  },
  {
    name: "inputs.keyspace",
    type: "text",
    label: "Keyspace",
    placeholder: "app_keyspace",
    isOptional: true
  },
  {
    name: "inputs.ca",
    type: "textarea",
    label: "CA (SSL)",
    placeholder: "-----BEGIN CERTIFICATE----- ...",
    isOptional: true,
    rows: 3
  }
] satisfies readonly TDynamicSecretProviderField<TCassandraFormValues>[];

const advancedFields = buildStatementFields<TCassandraFormValues>({
  renewOptional: false,
  copy: {
    creation:
      "Variables: keyspace, username, password, and expiration are dynamically provisioned.",
    revocation: "Variables: keyspace and username are dynamically provisioned.",
    renew: "Variables: keyspace, username, and expiration are dynamically provisioned."
  }
});

function CassandraFields() {
  return (
    <>
      <ProviderGroup id="cassandra-connection" presentation="panel">
        <ProviderFields fields={cassandraFields} />
        <SslRejectUnauthorizedField<TCassandraFormValues> />
      </ProviderGroup>
      <StatementAccordion title="Modify CQL Statements" fields={advancedFields} value="advanced" />
    </>
  );
}

export const cassandraFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.Cassandra,
  label: "Cassandra",
  schema: cassandraCreateFormSchema,
  getDefaultValues: getCassandraCreateDefaultValues,
  toPayload: getCassandraCreatePayload,
  Renderer: CassandraFields,
  submitLabel: "Submit"
});
