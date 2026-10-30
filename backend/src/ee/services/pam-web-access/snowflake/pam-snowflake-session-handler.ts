import { createDataExplorerSessionHandler } from "../pam-data-explorer-session-handler";
import { createSnowflakeConnectionController } from "./pam-snowflake-connection-controller";
import { fetchSchemasOneShot, fetchTablesOneShot, verifyReachabilityOneShot } from "./pam-snowflake-metadata";

export const handleSnowflakeSession = createDataExplorerSessionHandler({
  dialectName: "Snowflake",
  createController: createSnowflakeConnectionController,
  fetchSchemas: fetchSchemasOneShot,
  fetchTables: fetchTablesOneShot,
  verifyReachability: verifyReachabilityOneShot,
  extractErrorFields: (err: unknown) => {
    const snowflakeErr = err as { message?: string; sqlState?: string };
    return { message: snowflakeErr.message, detail: snowflakeErr.sqlState };
  }
});
