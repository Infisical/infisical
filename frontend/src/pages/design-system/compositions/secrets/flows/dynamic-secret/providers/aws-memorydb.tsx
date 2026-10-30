import {
  awsMemoryDbCreateFormSchema,
  awsMemoryDbEditFormSchema,
  getAwsMemoryDbCreateDefaultValues,
  getAwsMemoryDbCreatePayload,
  getAwsMemoryDbEditDefaultValues,
  getAwsMemoryDbEditPayload,
  type TAwsMemoryDbCreateValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/awsManagedStoresContract";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { buildStatementFields, ProviderFields, ProviderGroup, StatementAccordion } from "../fields";
import { defineFlowProvider } from "../types";

const connectionFields = [
  {
    name: "inputs.clusterName",
    type: "text",
    label: "Cluster Name",
    placeholder: "my-memorydb-cluster",
    layout: "half"
  },
  {
    name: "inputs.region",
    type: "text",
    label: "Region",
    placeholder: "us-east-1",
    layout: "half"
  },
  {
    name: "inputs.auth.accessKeyId",
    type: "text",
    label: "Access Key ID",
    placeholder: "AKIA...",
    layout: "half"
  },
  {
    name: "inputs.auth.secretAccessKey",
    type: "secret",
    label: "Secret Access Key",
    placeholder: "Enter secret access key",
    autoComplete: "new-password",
    layout: "half"
  }
] satisfies readonly TDynamicSecretProviderField<TAwsMemoryDbCreateValues>[];

const statementFields = buildStatementFields<TAwsMemoryDbCreateValues>({
  includeRenew: false,
  creationRows: 4
});

function AwsMemoryDbFields() {
  return (
    <>
      <ProviderGroup id="aws-managed-store-connection" presentation="panel">
        <ProviderFields fields={connectionFields} />
      </ProviderGroup>
      <StatementAccordion title="Modify MemoryDB Statements" fields={statementFields} />
    </>
  );
}

export const awsMemoryDbFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.AwsMemoryDb,
  label: "AWS MemoryDB",
  schema: awsMemoryDbCreateFormSchema,
  getDefaultValues: getAwsMemoryDbCreateDefaultValues,
  toPayload: getAwsMemoryDbCreatePayload,
  Renderer: AwsMemoryDbFields,
  submitLabel: "Submit",
  edit: {
    schema: awsMemoryDbEditFormSchema,
    getDefaultValues: getAwsMemoryDbEditDefaultValues,
    toPayload: getAwsMemoryDbEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
