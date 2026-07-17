import { z } from "zod";

import { DynamicSecretProviders } from "../dynamic-secret/providers/models";

// Providers a proxied service can broker over HTTP, with the eligible output fields and any lease config.
// A provider not listed can't be brokered; a field not listed is blocked (e.g. metadata).
// keep in sync with frontend/src/components/proxied-services/forms/brokerableDynamicSecrets.ts
type TBrokerableDynamicSecret = {
  fields: string[];
  leaseConfigSchema?: z.ZodTypeAny;
};

const KubernetesLeaseConfigSchema = z.object({ namespace: z.string().trim().min(1).optional() }).strict();

export const BROKERABLE_DYNAMIC_SECRETS: Partial<Record<DynamicSecretProviders, TBrokerableDynamicSecret>> = {
  [DynamicSecretProviders.Kubernetes]: { fields: ["TOKEN"], leaseConfigSchema: KubernetesLeaseConfigSchema },
  [DynamicSecretProviders.Github]: { fields: ["TOKEN"] },
  [DynamicSecretProviders.GcpIam]: { fields: ["TOKEN"] },
  [DynamicSecretProviders.IbmApiConnect]: { fields: ["CLIENT_ID", "CLIENT_SECRET"] },
  [DynamicSecretProviders.ElasticSearch]: { fields: ["DB_USERNAME", "DB_PASSWORD"] },
  [DynamicSecretProviders.Clickhouse]: { fields: ["DB_USERNAME", "DB_PASSWORD"] },
  [DynamicSecretProviders.Couchbase]: { fields: ["username", "password"] },
  [DynamicSecretProviders.RabbitMq]: { fields: ["DB_USERNAME", "DB_PASSWORD"] },
  [DynamicSecretProviders.Snowflake]: { fields: ["DB_USERNAME", "DB_PASSWORD"] },
  [DynamicSecretProviders.Milvus]: { fields: ["DB_USERNAME", "DB_PASSWORD"] },
  [DynamicSecretProviders.AzureEntraID]: { fields: ["email", "password"] },
  [DynamicSecretProviders.Totp]: { fields: ["TOTP"] }
};
