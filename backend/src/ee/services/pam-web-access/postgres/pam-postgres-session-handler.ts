import {
  createDataExplorerSessionHandler,
  type TDataExplorerDialectConfig
} from "../pam-data-explorer-session-handler";
import { createPostgresConnectionController } from "./pam-postgres-connection-controller";
import { fetchSchemasOneShot, fetchTablesOneShot, verifyReachabilityOneShot } from "./pam-postgres-metadata";

const postgresDialect: TDataExplorerDialectConfig = {
  dialectName: "Postgres",
  createController: createPostgresConnectionController,
  fetchSchemas: fetchSchemasOneShot,
  fetchTables: fetchTablesOneShot,
  verifyReachability: verifyReachabilityOneShot,
  extractErrorFields: (err: unknown) => {
    const pgErr = err as { message?: string; detail?: string; hint?: string };
    return { message: pgErr.message, detail: pgErr.detail, hint: pgErr.hint };
  }
};

export const handlePostgresSession = createDataExplorerSessionHandler(postgresDialect);

export const handleCockroachdbSession = createDataExplorerSessionHandler({
  ...postgresDialect,
  dialectName: "CockroachDB",
  createController: (params) => createPostgresConnectionController(params, { lexicalFallback: true })
});
