import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { buildStatementFields, StatementAccordion } from "../shared";
import { defineDynamicSecretProvider } from "../types";
import {
  awsElastiCacheCreateFormSchema,
  awsElastiCacheEditFormSchema,
  awsMemoryDbCreateFormSchema,
  awsMemoryDbEditFormSchema,
  getAwsElastiCacheCreateDefaultValues,
  getAwsElastiCacheCreatePayload,
  getAwsElastiCacheEditDefaultValues,
  getAwsElastiCacheEditPayload,
  getAwsMemoryDbCreateDefaultValues,
  getAwsMemoryDbCreatePayload,
  getAwsMemoryDbEditDefaultValues,
  getAwsMemoryDbEditPayload
} from "./awsManagedStoresContract";

const elastiCacheConnectionFields = [
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
] as const;

const memoryDbConnectionFields = [
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
] as const;

const statementFields = buildStatementFields({
  includeRenew: false,
  creationRows: 4
});

const AwsManagedStoreFields = ({ memoryDb = false }: { memoryDb?: boolean }) => (
  <>
    <DynamicSecretProviderGroup id="aws-managed-store-connection" presentation="panel">
      <DynamicSecretProviderFields
        fields={memoryDb ? memoryDbConnectionFields : elastiCacheConnectionFields}
      />
    </DynamicSecretProviderGroup>
    <StatementAccordion
      title={`Modify ${memoryDb ? "MemoryDB" : "ElastiCache"} Statements`}
      fields={statementFields}
    />
  </>
);

const AwsElastiCacheFields = () => <AwsManagedStoreFields />;
const AwsMemoryDbFields = () => <AwsManagedStoreFields memoryDb />;

export const awsElastiCacheDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.AwsElastiCache,
  label: "AWS ElastiCache",
  customRenderer: {
    reasons: ["non-scalar-value"],
    Component: AwsElastiCacheFields
  },
  create: {
    schema: awsElastiCacheCreateFormSchema,
    getDefaultValues: getAwsElastiCacheCreateDefaultValues,
    toPayload: getAwsElastiCacheCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: awsElastiCacheEditFormSchema,
    getDefaultValues: getAwsElastiCacheEditDefaultValues,
    toPayload: getAwsElastiCacheEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

export const awsMemoryDbDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.AwsMemoryDb,
  label: "AWS MemoryDB",
  customRenderer: {
    reasons: ["non-scalar-value"],
    Component: AwsMemoryDbFields
  },
  create: {
    schema: awsMemoryDbCreateFormSchema,
    getDefaultValues: getAwsMemoryDbCreateDefaultValues,
    toPayload: getAwsMemoryDbCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: awsMemoryDbEditFormSchema,
    getDefaultValues: getAwsMemoryDbEditDefaultValues,
    toPayload: getAwsMemoryDbEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
