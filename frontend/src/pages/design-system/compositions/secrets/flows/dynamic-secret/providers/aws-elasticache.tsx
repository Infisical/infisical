import {
  awsElastiCacheCreateFormSchema,
  getAwsElastiCacheCreateDefaultValues,
  getAwsElastiCacheCreatePayload,
  type TAwsElastiCacheCreateValues
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
    placeholder: "my-elasticache-cluster",
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
    name: "inputs.accessKeyId",
    type: "text",
    label: "Access Key ID",
    placeholder: "AKIA...",
    layout: "half"
  },
  {
    name: "inputs.secretAccessKey",
    type: "secret",
    label: "Secret Access Key",
    placeholder: "Enter secret access key",
    autoComplete: "new-password",
    layout: "half"
  }
] satisfies readonly TDynamicSecretProviderField<TAwsElastiCacheCreateValues>[];

const statementFields = buildStatementFields<TAwsElastiCacheCreateValues>({
  includeRenew: false,
  creationRows: 4
});

function AwsElastiCacheFields() {
  return (
    <>
      <ProviderGroup id="aws-managed-store-connection" presentation="panel">
        <ProviderFields fields={connectionFields} />
      </ProviderGroup>
      <StatementAccordion title="Modify ElastiCache Statements" fields={statementFields} />
    </>
  );
}

export const awsElastiCacheFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.AwsElastiCache,
  label: "AWS ElastiCache",
  schema: awsElastiCacheCreateFormSchema,
  getDefaultValues: getAwsElastiCacheCreateDefaultValues,
  toPayload: getAwsElastiCacheCreatePayload,
  Renderer: AwsElastiCacheFields,
  submitLabel: "Submit"
});
