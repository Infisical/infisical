import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

export const RELATIONAL_WAREHOUSE_DYNAMIC_SECRET_PROVIDERS = [
  DynamicSecretProviders.SqlDatabase,
  DynamicSecretProviders.AzureSqlDatabase,
  DynamicSecretProviders.Clickhouse,
  DynamicSecretProviders.Snowflake,
  DynamicSecretProviders.Vertica,
  DynamicSecretProviders.SapAse,
  DynamicSecretProviders.SapHana
] as const;
