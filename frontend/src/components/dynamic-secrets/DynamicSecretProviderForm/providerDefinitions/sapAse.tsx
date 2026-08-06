import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { buildStatementFields, StatementAccordion } from "../shared";
import { defineDynamicSecretProvider } from "../types";
import {
  getSapAseCreateDefaultValues,
  getSapAseCreatePayload,
  getSapAseEditDefaultValues,
  getSapAseEditPayload,
  SAP_ASE_CUSTOM_RENDERER_REASONS,
  sapAseCreateFormSchema,
  sapAseEditFormSchema
} from "./sapAseContract";

const sapAseCreateConnectionFields = [
  { name: "inputs.host", type: "text", label: "Host", layout: "half" },
  { name: "inputs.port", type: "number", label: "Port", layout: "half" },
  { name: "inputs.database", type: "text", label: "Database" },
  { name: "inputs.username", type: "text", label: "User", layout: "half" },
  {
    name: "inputs.password",
    type: "secret",
    label: "Password",
    autoComplete: "new-password",
    layout: "half"
  }
] as const;

const sapAseEditConnectionFields = [
  ...sapAseCreateConnectionFields,
  { name: "inputs.ca", type: "secret", label: "CA (SSL)", isOptional: true }
] as const;

const sapAseAdvancedFields = buildStatementFields({
  includeRenew: false,
  copy: {
    creation:
      "Username and password are dynamically provisioned. The sp_addlogin statement runs against the master database; other statements run against the selected database.",
    revocation:
      "Username is dynamically provisioned. The sp_droplogin statement runs against the master database; other statements run against the selected database."
  }
});

const SapAseCreateFields = () => (
  <>
    <DynamicSecretProviderGroup id="sap-ase-connection" presentation="panel">
      <DynamicSecretProviderFields fields={sapAseCreateConnectionFields} />
    </DynamicSecretProviderGroup>
    <StatementAccordion title="Modify SQL Statements" fields={sapAseAdvancedFields} />
  </>
);

const SapAseEditFields = () => (
  <>
    <DynamicSecretProviderGroup id="sap-ase-connection" presentation="panel">
      <DynamicSecretProviderFields fields={sapAseEditConnectionFields} />
    </DynamicSecretProviderGroup>
    <StatementAccordion title="Modify SQL Statements" fields={sapAseAdvancedFields} />
  </>
);

export const sapAseDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.SapAse,
  label: "SAP ASE",
  create: {
    schema: sapAseCreateFormSchema,
    getDefaultValues: getSapAseCreateDefaultValues,
    toPayload: getSapAseCreatePayload,
    customRenderer: {
      reasons: SAP_ASE_CUSTOM_RENDERER_REASONS,
      Component: SapAseCreateFields
    },
    submitLabel: "Submit"
  },
  edit: {
    schema: sapAseEditFormSchema,
    getDefaultValues: getSapAseEditDefaultValues,
    toPayload: getSapAseEditPayload,
    customRenderer: {
      reasons: SAP_ASE_CUSTOM_RENDERER_REASONS,
      Component: SapAseEditFields
    },
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
