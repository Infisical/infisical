import {
  getSapHanaCreateDefaultValues,
  getSapHanaCreatePayload,
  getSapHanaEditDefaultValues,
  getSapHanaEditPayload,
  sapHanaCreateFormSchema,
  sapHanaEditFormSchema,
  type TSapHanaCreateFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/sapHanaContract";
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

const connectionFields = [
  {
    name: "inputs.host",
    type: "text",
    label: "Host",
    placeholder: "hana.example.com",
    layout: "half"
  },
  { name: "inputs.port", type: "number", label: "Port", layout: "half" },
  {
    name: "inputs.username",
    type: "text",
    label: "User",
    placeholder: "SYSTEM",
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
  {
    name: "inputs.ca",
    type: "secret",
    label: "CA (SSL)",
    placeholder: "-----BEGIN CERTIFICATE----- ...",
    isOptional: true
  }
] satisfies readonly TDynamicSecretProviderField<TSapHanaCreateFormValues>[];

const advancedFields = buildStatementFields<TSapHanaCreateFormValues>();

function SapHanaFields() {
  return (
    <>
      <ProviderGroup id="sap-hana-connection" presentation="panel">
        <ProviderFields fields={connectionFields} />
        <SslRejectUnauthorizedField<TSapHanaCreateFormValues> />
      </ProviderGroup>
      <StatementAccordion title="Modify SQL Statements" fields={advancedFields} />
    </>
  );
}

export const sapHanaFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.SapHana,
  label: "SAP HANA",
  schema: sapHanaCreateFormSchema,
  getDefaultValues: getSapHanaCreateDefaultValues,
  toPayload: getSapHanaCreatePayload,
  Renderer: SapHanaFields,
  submitLabel: "Submit",
  edit: {
    schema: sapHanaEditFormSchema,
    getDefaultValues: getSapHanaEditDefaultValues,
    toPayload: getSapHanaEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
