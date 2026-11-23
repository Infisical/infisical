import { createDataExplorerSessionHandler } from "../pam-data-explorer-session-handler";
import { extractMssqlErrorFields } from "./pam-mssql-client";
import { createMssqlConnectionController } from "./pam-mssql-connection-controller";
import { fetchSchemasOneShot, fetchTablesOneShot, verifyReachabilityOneShot } from "./pam-mssql-metadata";

export const handleMssqlSession = createDataExplorerSessionHandler({
  dialectName: "MSSQL",
  createController: createMssqlConnectionController,
  fetchSchemas: fetchSchemasOneShot,
  fetchTables: fetchTablesOneShot,
  verifyReachability: verifyReachabilityOneShot,
  extractErrorFields: extractMssqlErrorFields
});
