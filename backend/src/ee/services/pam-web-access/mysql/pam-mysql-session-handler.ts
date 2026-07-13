import { createDataExplorerSessionHandler } from "../pam-data-explorer-session-handler";
import { createMysqlConnectionController } from "./pam-mysql-connection-controller";
import { fetchSchemasOneShot, fetchTablesOneShot, verifyReachabilityOneShot } from "./pam-mysql-metadata";

export const handleMysqlSession = createDataExplorerSessionHandler({
  dialectName: "MySQL",
  createController: createMysqlConnectionController,
  fetchSchemas: fetchSchemasOneShot,
  fetchTables: fetchTablesOneShot,
  verifyReachability: verifyReachabilityOneShot,
  extractErrorFields: (err: unknown) => {
    const mysqlErr = err as { message?: string; sqlMessage?: string; code?: string };
    return { message: mysqlErr.sqlMessage ?? mysqlErr.message, detail: mysqlErr.code };
  }
});
