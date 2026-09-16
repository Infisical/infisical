import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import type { TRegisteredDynamicSecretProviderDefinition } from "../registry";
import { defineDynamicSecretProviderModule } from "../registry";
import { azureSqlDatabaseDynamicSecretProvider } from "./azureSqlDatabase";
import { clickHouseDynamicSecretProvider } from "./clickHouse";
import { RELATIONAL_WAREHOUSE_DYNAMIC_SECRET_PROVIDERS } from "./relationalWarehouseContract";
import { sapAseDynamicSecretProvider } from "./sapAse";
import { sapHanaDynamicSecretProvider } from "./sapHana";
import { snowflakeDynamicSecretProvider } from "./snowflake";
import { sqlDatabaseDynamicSecretProvider } from "./sqlDatabase";
import { verticaDynamicSecretProvider } from "./vertica";

const definitionsByProvider = {
  [DynamicSecretProviders.SqlDatabase]: sqlDatabaseDynamicSecretProvider,
  [DynamicSecretProviders.AzureSqlDatabase]: azureSqlDatabaseDynamicSecretProvider,
  [DynamicSecretProviders.Clickhouse]: clickHouseDynamicSecretProvider,
  [DynamicSecretProviders.Snowflake]: snowflakeDynamicSecretProvider,
  [DynamicSecretProviders.Vertica]: verticaDynamicSecretProvider,
  [DynamicSecretProviders.SapAse]: sapAseDynamicSecretProvider,
  [DynamicSecretProviders.SapHana]: sapHanaDynamicSecretProvider
} satisfies Record<
  (typeof RELATIONAL_WAREHOUSE_DYNAMIC_SECRET_PROVIDERS)[number],
  TRegisteredDynamicSecretProviderDefinition
>;

export const relationalWarehouseDynamicSecretProviders = defineDynamicSecretProviderModule({
  id: "relational-warehouse",
  definitions: RELATIONAL_WAREHOUSE_DYNAMIC_SECRET_PROVIDERS.map(
    (provider) => definitionsByProvider[provider]
  )
});
