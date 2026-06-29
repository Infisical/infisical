import { createDataExplorerSessionHandler } from "../pam-data-explorer-session-handler";
import { createPostgresConnectionController } from "./pam-postgres-connection-controller";
import { fetchSchemasOneShot, fetchTablesOneShot, verifyReachabilityOneShot } from "./pam-postgres-metadata";

export const handlePostgresSession = createDataExplorerSessionHandler({
  dialectName: "Postgres",
  createController: createPostgresConnectionController,
  fetchSchemas: fetchSchemasOneShot,
  fetchTables: fetchTablesOneShot,
  verifyReachability: verifyReachabilityOneShot,
  extractErrorFields: (err: unknown) => {
    const pgErr = err as { message?: string; detail?: string; hint?: string };
    return { message: pgErr.message, detail: pgErr.detail, hint: pgErr.hint };
  }
});
