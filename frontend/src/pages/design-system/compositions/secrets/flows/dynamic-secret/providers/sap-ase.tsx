import {
  getSapAseCreateDefaultValues,
  getSapAseCreatePayload,
  sapAseCreateFormSchema,
  type TSapAseCreateFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/sapAseContract";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { buildStatementFields, ProviderFields, ProviderGroup, StatementAccordion } from "../fields";
import { defineFlowProvider } from "../types";

const connectionFields = [
  {
    name: "inputs.host",
    type: "text",
    label: "Host",
    placeholder: "ase.example.com",
    layout: "half"
  },
  { name: "inputs.port", type: "number", label: "Port", layout: "half" },
  { name: "inputs.database", type: "text", label: "Database", placeholder: "app_db" },
  {
    name: "inputs.username",
    type: "text",
    label: "User",
    placeholder: "sa",
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
] satisfies readonly TDynamicSecretProviderField<TSapAseCreateFormValues>[];

const advancedFields = buildStatementFields<TSapAseCreateFormValues>({
  includeRenew: false,
  copy: {
    creation:
      "Username and password are dynamically provisioned. The sp_addlogin statement runs against the master database; other statements run against the selected database.",
    revocation:
      "Username is dynamically provisioned. The sp_droplogin statement runs against the master database; other statements run against the selected database."
  }
});

function SapAseFields() {
  return (
    <>
      <ProviderGroup id="sap-ase-connection" presentation="panel">
        <ProviderFields fields={connectionFields} />
      </ProviderGroup>
      <StatementAccordion title="Modify SQL Statements" fields={advancedFields} />
    </>
  );
}

export const sapAseFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.SapAse,
  label: "SAP ASE",
  schema: sapAseCreateFormSchema,
  getDefaultValues: getSapAseCreateDefaultValues,
  toPayload: getSapAseCreatePayload,
  Renderer: SapAseFields,
  submitLabel: "Submit"
});
