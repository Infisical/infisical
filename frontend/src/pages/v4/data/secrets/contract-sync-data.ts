import type { TCamundaCluster } from "@app/hooks/api/appConnections/camunda/types";
import type { TDatabricksSecretScope } from "@app/hooks/api/appConnections/databricks/types";
import type { THasuraCloudProject } from "@app/hooks/api/appConnections/hasura-cloud/types";
import type {
  TListSnowflakeSchemas,
  TSnowflakeDatabase,
  TSnowflakeSchema
} from "@app/hooks/api/appConnections/snowflake/types";
import type { TZabbixHost } from "@app/hooks/api/appConnections/zabbix/types";

import type { V4QueryResult } from "../contract";
import type { ConnectionOptions, QueryOptions } from "./contract-options";

export type SyncDataLookups = {
  useDatabricksSecretScopes: ConnectionOptions<TDatabricksSecretScope>;
  useSnowflakeDatabases: ConnectionOptions<TSnowflakeDatabase>;
  useSnowflakeSchemas: (
    dto: TListSnowflakeSchemas,
    options?: QueryOptions
  ) => V4QueryResult<TSnowflakeSchema[]>;
  useHasuraCloudProjects: ConnectionOptions<THasuraCloudProject>;
  useCamundaClusters: ConnectionOptions<TCamundaCluster>;
  useZabbixHosts: ConnectionOptions<TZabbixHost>;
};
