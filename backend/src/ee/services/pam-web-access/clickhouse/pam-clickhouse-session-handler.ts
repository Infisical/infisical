import { createDataExplorerSessionHandler } from "../pam-data-explorer-session-handler";
import { clickhouseErrorFields } from "./pam-clickhouse-client";
import { createClickhouseConnectionController } from "./pam-clickhouse-connection-controller";
import { fetchSchemasOneShot, fetchTablesOneShot, verifyReachabilityOneShot } from "./pam-clickhouse-metadata";

export const handleClickhouseSession = createDataExplorerSessionHandler({
  dialectName: "ClickHouse",
  createController: createClickhouseConnectionController,
  fetchSchemas: fetchSchemasOneShot,
  fetchTables: fetchTablesOneShot,
  verifyReachability: verifyReachabilityOneShot,
  extractErrorFields: clickhouseErrorFields
});
