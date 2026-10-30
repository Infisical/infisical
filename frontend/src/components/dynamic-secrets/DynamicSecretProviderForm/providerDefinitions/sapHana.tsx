import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { buildStatementFields, SslRejectUnauthorizedField, StatementAccordion } from "../shared";
import { defineDynamicSecretProvider } from "../types";
import {
  getSapHanaCreateDefaultValues,
  getSapHanaCreatePayload,
  getSapHanaEditDefaultValues,
  getSapHanaEditPayload,
  SAP_HANA_CUSTOM_RENDERER_REASONS,
  sapHanaCreateFormSchema,
  sapHanaEditFormSchema
} from "./sapHanaContract";

const sapHanaConnectionFields = [
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
] as const;

const sapHanaAdvancedFields = buildStatementFields();

const SapHanaFields = () => (
  <>
    <DynamicSecretProviderGroup id="sap-hana-connection" presentation="panel">
      <DynamicSecretProviderFields fields={sapHanaConnectionFields} />
      <SslRejectUnauthorizedField
        id="sap-hana-ssl-reject-unauthorized"
        fallbackChecked
        layout="labeled"
      />
    </DynamicSecretProviderGroup>
    <StatementAccordion title="Modify SQL Statements" fields={sapHanaAdvancedFields} />
  </>
);

export const sapHanaDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.SapHana,
  label: "SAP HANA",
  customRenderer: {
    reasons: SAP_HANA_CUSTOM_RENDERER_REASONS,
    Component: SapHanaFields
  },
  create: {
    schema: sapHanaCreateFormSchema,
    getDefaultValues: getSapHanaCreateDefaultValues,
    toPayload: getSapHanaCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: sapHanaEditFormSchema,
    getDefaultValues: getSapHanaEditDefaultValues,
    toPayload: getSapHanaEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
