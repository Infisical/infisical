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

const elasticConnectionFields = [
  { name: "inputs.clusterName", type: "text", label: "Cluster Name", layout: "half" },
  { name: "inputs.region", type: "text", label: "Region", layout: "half" },
  { name: "inputs.accessKeyId", type: "text", label: "Access Key ID", layout: "half" },
  {
    name: "inputs.secretAccessKey",
    type: "secret",
    label: "Secret Access Key",
    autoComplete: "new-password",
    layout: "half"
  }
] as const;
const memoryConnectionFields = [
  { name: "inputs.clusterName", type: "text", label: "Cluster Name", layout: "half" },
  { name: "inputs.region", type: "text", label: "Region", layout: "half" },
  { name: "inputs.auth.accessKeyId", type: "text", label: "Access Key ID", layout: "half" },
  {
    name: "inputs.auth.secretAccessKey",
    type: "secret",
    label: "Secret Access Key",
    autoComplete: "new-password",
    layout: "half"
  }
] as const;
const advancedFields = buildStatementFields({
  includeRenew: false,
  creationRows: 4
});

const StoreFields = ({ memoryDb = false }: { memoryDb?: boolean }) => (
  <>
    <DynamicSecretProviderGroup id="aws-store-connection" presentation="panel">
      <DynamicSecretProviderFields
        fields={memoryDb ? memoryConnectionFields : elasticConnectionFields}
      />
    </DynamicSecretProviderGroup>
    <StatementAccordion
      title={`Modify ${memoryDb ? "MemoryDB" : "ElastiCache"} Statements`}
      fields={advancedFields}
    />
  </>
);
const ElastiCacheFields = () => <StoreFields />;
const MemoryDbFields = () => <StoreFields memoryDb />;

export const awsElastiCacheDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.AwsElastiCache,
  label: "AWS ElastiCache",
  customRenderer: { reasons: ["non-scalar-value"], Component: ElastiCacheFields },
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
  customRenderer: { reasons: ["non-scalar-value"], Component: MemoryDbFields },
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
