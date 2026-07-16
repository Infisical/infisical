import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

// Dynamic-secret providers a proxied service can broker over HTTP, mapped to the eligible output fields.
// A provider not listed can't be brokered; a field not listed is hidden (e.g. metadata like EXPIRES_AT).
// keep in sync with backend/src/ee/services/proxied-service/proxied-service-brokerable-outputs.ts
export const BROKERABLE_DYNAMIC_SECRET_OUTPUTS: Partial<Record<DynamicSecretProviders, string[]>> =
  {
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
    [DynamicSecretProviders.AzureEntraId]: ["email", "password"],
    [DynamicSecretProviders.Totp]: ["TOTP"]
  };
