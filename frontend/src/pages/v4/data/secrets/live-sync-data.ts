import { useCamundaConnectionListClusters } from "@app/hooks/api/appConnections/camunda";
import { useDatabricksConnectionListSecretScopes } from "@app/hooks/api/appConnections/databricks";
import { useHasuraCloudConnectionListProjects } from "@app/hooks/api/appConnections/hasura-cloud";
import {
  useSnowflakeConnectionListDatabases,
  useSnowflakeConnectionListSchemas
} from "@app/hooks/api/appConnections/snowflake";
import { useZabbixConnectionListHosts } from "@app/hooks/api/appConnections/zabbix";

import type { SyncDataLookups } from "./contract-sync-data";

export const syncDataLive: SyncDataLookups = {
  useDatabricksSecretScopes: (connectionId, options) =>
    useDatabricksConnectionListSecretScopes(connectionId, options),
  useSnowflakeDatabases: (connectionId, options) =>
    useSnowflakeConnectionListDatabases(connectionId, options),
  useSnowflakeSchemas: (dto, options) => useSnowflakeConnectionListSchemas(dto, options),
  useHasuraCloudProjects: (connectionId, options) =>
    useHasuraCloudConnectionListProjects(connectionId, options),
  useCamundaClusters: (connectionId, options) =>
    useCamundaConnectionListClusters(connectionId, options),
  useZabbixHosts: (connectionId, options) => useZabbixConnectionListHosts(connectionId, options)
};
