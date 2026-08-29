import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

/** Providers owned by the data-service and protocol rollout batch. */
export const DATA_PROTOCOL_DYNAMIC_SECRET_PROVIDERS = [
  DynamicSecretProviders.Cassandra,
  DynamicSecretProviders.ElasticSearch,
  DynamicSecretProviders.Kubernetes,
  DynamicSecretProviders.Milvus,
  DynamicSecretProviders.RabbitMq,
  DynamicSecretProviders.IbmApiConnect,
  DynamicSecretProviders.Totp
] as const;
