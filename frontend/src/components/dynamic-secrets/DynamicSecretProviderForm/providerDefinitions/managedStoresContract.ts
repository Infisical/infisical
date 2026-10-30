import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

export const MANAGED_STORE_DYNAMIC_SECRET_PROVIDERS = [
  DynamicSecretProviders.Redis,
  DynamicSecretProviders.AwsElastiCache,
  DynamicSecretProviders.AwsMemoryDb,
  DynamicSecretProviders.MongoAtlas,
  DynamicSecretProviders.MongoDB,
  DynamicSecretProviders.Couchbase
] as const;
