import { z } from "zod";

import { DynamicSecretProviders } from "./models";

// Canonical map of dynamic secret provider -> every field its lease output can contain, plus the
// per-lease config a proxied service may set. This drives proxied-service field validation: any listed
// field may be injected. We deliberately don't distinguish "credential" fields from lease metadata or
// recommend any — which field to reference is entirely the user's choice.
//
// KEEP IN SYNC with the frontend mirror at
// frontend/src/hooks/api/dynamicSecret/providerOutputs.ts
// (same convention as the host-pattern grammar shared with the CLI's match.go).
//
// Field names match each provider's create() return verbatim, including the lowercase oddballs
// (azure-entra-id -> email/password, couchbase -> username/password).

export type TDynamicSecretProviderOutputEntry = {
  outputFields: string[];
  // undefined = the provider accepts no per-lease config; a non-empty config is then rejected.
  leaseConfigSchema?: z.ZodTypeAny;
};

export const DynamicSecretKubernetesLeaseConfigSchema = z
  .object({ namespace: z.string().trim().min(1).optional() })
  .strict();

export const DynamicSecretSshLeaseConfigSchema = z
  .object({ principals: z.array(z.string().trim().min(1)).optional() })
  .strict();

const DB_USER_PASS = ["DB_USERNAME", "DB_PASSWORD"];

export const DYNAMIC_SECRET_PROVIDER_OUTPUTS: Record<DynamicSecretProviders, TDynamicSecretProviderOutputEntry> = {
  [DynamicSecretProviders.SqlDatabase]: { outputFields: DB_USER_PASS },
  [DynamicSecretProviders.Clickhouse]: { outputFields: DB_USER_PASS },
  [DynamicSecretProviders.Cassandra]: { outputFields: DB_USER_PASS },
  // aws-iam returns SESSION_TOKEN for the STS-based methods (assume-role / access-key / IRSA) and
  // USERNAME for the IAM-user method; the shape depends on encrypted provider config, so both are listed.
  [DynamicSecretProviders.AwsIam]: { outputFields: ["ACCESS_KEY", "SECRET_ACCESS_KEY", "SESSION_TOKEN", "USERNAME"] },
  [DynamicSecretProviders.Redis]: { outputFields: DB_USER_PASS },
  [DynamicSecretProviders.AwsElastiCache]: { outputFields: DB_USER_PASS },
  [DynamicSecretProviders.AwsMemoryDb]: { outputFields: DB_USER_PASS },
  [DynamicSecretProviders.MongoAtlas]: { outputFields: DB_USER_PASS },
  [DynamicSecretProviders.ElasticSearch]: { outputFields: DB_USER_PASS },
  [DynamicSecretProviders.MongoDB]: { outputFields: DB_USER_PASS },
  [DynamicSecretProviders.RabbitMq]: { outputFields: DB_USER_PASS },
  [DynamicSecretProviders.AzureEntraID]: { outputFields: ["email", "password"] },
  [DynamicSecretProviders.AzureSqlDatabase]: { outputFields: DB_USER_PASS },
  [DynamicSecretProviders.Ldap]: { outputFields: ["USERNAME", "PASSWORD", "DN_ARRAY"] },
  [DynamicSecretProviders.SapHana]: { outputFields: DB_USER_PASS },
  [DynamicSecretProviders.Snowflake]: { outputFields: DB_USER_PASS },
  [DynamicSecretProviders.Totp]: { outputFields: ["TOTP", "TIME_REMAINING"] },
  [DynamicSecretProviders.SapAse]: { outputFields: DB_USER_PASS },
  [DynamicSecretProviders.Kubernetes]: {
    outputFields: ["TOKEN"],
    leaseConfigSchema: DynamicSecretKubernetesLeaseConfigSchema
  },
  [DynamicSecretProviders.Vertica]: { outputFields: DB_USER_PASS },
  [DynamicSecretProviders.GcpIam]: { outputFields: ["SERVICE_ACCOUNT_EMAIL", "TOKEN"] },
  [DynamicSecretProviders.Github]: {
    outputFields: ["TOKEN", "EXPIRES_AT", "PERMISSIONS", "REPOSITORY_SELECTION"]
  },
  [DynamicSecretProviders.Couchbase]: { outputFields: ["username", "password"] },
  [DynamicSecretProviders.Milvus]: { outputFields: DB_USER_PASS },
  [DynamicSecretProviders.Ssh]: {
    outputFields: ["PRIVATE_KEY", "SIGNED_KEY"],
    leaseConfigSchema: DynamicSecretSshLeaseConfigSchema
  },
  [DynamicSecretProviders.IbmApiConnect]: { outputFields: ["CLIENT_ID", "CLIENT_SECRET"] }
};
