import { DynamicSecretProviders } from "../dynamic-secret/providers/models";

// Providers/fields a proxied service can broker over HTTP; anything not listed is blocked.
// keep in sync with frontend/src/components/proxied-services/forms/brokerableDynamicSecrets.ts
export const BROKERABLE_DYNAMIC_SECRET_OUTPUTS: Partial<Record<DynamicSecretProviders, string[]>> = {
  [DynamicSecretProviders.Kubernetes]: ["TOKEN"],
  [DynamicSecretProviders.Github]: ["TOKEN"],
  [DynamicSecretProviders.GcpIam]: ["TOKEN"],
  [DynamicSecretProviders.IbmApiConnect]: ["CLIENT_ID", "CLIENT_SECRET"],
  [DynamicSecretProviders.ElasticSearch]: ["DB_USERNAME", "DB_PASSWORD"],
  [DynamicSecretProviders.Clickhouse]: ["DB_USERNAME", "DB_PASSWORD"],
  [DynamicSecretProviders.Couchbase]: ["username", "password"],
  [DynamicSecretProviders.RabbitMq]: ["DB_USERNAME", "DB_PASSWORD"],
  [DynamicSecretProviders.Snowflake]: ["DB_USERNAME", "DB_PASSWORD"],
  [DynamicSecretProviders.Milvus]: ["DB_USERNAME", "DB_PASSWORD"],
  [DynamicSecretProviders.AzureEntraID]: ["email", "password"],
  [DynamicSecretProviders.Totp]: ["TOTP"]
};
