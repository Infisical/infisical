import pg from "pg";

import {
  TPostgresAccountCredentials,
  TPostgresResourceConnectionDetails
} from "@app/ee/services/pam-resource/postgres/postgres-resource-types";
import { logger } from "@app/lib/logger";

import { getSchemasQuery, getTableDetailQuery, getTablesQuery } from "./pam-postgres-data-browser-metadata";
import {
  parseDataBrowserClientMessage,
  resolveEndReason,
  TDataBrowserSessionContext,
  TSessionHandlerResult
} from "./pam-web-access-types";

type TPostgresDataBrowserParams = {
  connectionDetails: TPostgresResourceConnectionDetails;
  credentials: TPostgresAccountCredentials;
};

export const handlePostgresDataBrowser = async (
  ctx: TDataBrowserSessionContext,
  params: TPostgresDataBrowserParams
): Promise<TSessionHandlerResult> => {
  const { socket, relayPort, sessionId, sendMessage, sendReady, sendSessionEnd, isNearSessionExpiry, onCleanup } = ctx;
  const { connectionDetails, credentials } = params;

  const pgClient = new pg.Client({
    host: "localhost",
    port: relayPort,
    user: credentials.username,
    database: connectionDetails.database,
    password: "",
    ssl: false,
    connectionTimeoutMillis: 30_000,
    statement_timeout: 30_000,
    // Return all values as strings (same as terminal handler)
    types: {
      getTypeParser: () => (val: string | Buffer) => (typeof val === "string" ? val : val.toString("hex"))
    }
  });

  await pgClient.connect();

  sendReady();

  logger.info({ sessionId }, "Postgres data browser session established");

  // Sequential message processing to prevent concurrent query issues
  let processingPromise = Promise.resolve();

  socket.on("message", (rawData: Buffer | ArrayBuffer | Buffer[]) => {
    processingPromise = processingPromise
      .then(async () => {
        const message = parseDataBrowserClientMessage(rawData);
        if (!message) return;

        try {
          switch (message.type) {
            case "pg-get-schemas": {
              const query = getSchemasQuery();
              const result = await pgClient.query(query.text, query.values);
              sendMessage({
                type: "pg-schemas",
                id: message.id,
                data: result.rows as { name: string }[]
              });
              break;
            }

            case "pg-get-tables": {
              const query = getTablesQuery(message.schema);
              const result = await pgClient.query(query.text, query.values);
              sendMessage({
                type: "pg-tables",
                id: message.id,
                data: result.rows as { name: string; tableType: string }[]
              });
              break;
            }

            case "pg-get-table-detail": {
              const query = getTableDetailQuery(message.schema, message.table);
              const result = await pgClient.query<{ result: string }>(query.text, query.values);
              const rawDetail = result.rows[0]?.result;
              if (!rawDetail) {
                sendMessage({
                  type: "pg-error",
                  id: message.id,
                  error: "Table not found or no metadata available"
                });
                break;
              }
              const detail =
                typeof rawDetail === "string"
                  ? (JSON.parse(rawDetail) as Record<string, unknown>)
                  : (rawDetail as unknown as Record<string, unknown>);
              sendMessage({
                type: "pg-table-detail",
                id: message.id,
                data: detail as {
                  columns: {
                    name: string;
                    type: string;
                    typeOid: number;
                    nullable: boolean;
                    defaultValue: string | null;
                    isIdentity: boolean;
                    identityGeneration: string | null;
                    isArray: boolean;
                    maxLength: number | null;
                  }[];
                  primaryKeys: string[];
                  foreignKeys: {
                    constraintName: string;
                    columns: string[];
                    targetSchema: string;
                    targetTable: string;
                    targetColumns: string[];
                  }[];
                  enums: Record<string, string[]>;
                }
              });
              break;
            }

            case "pg-query": {
              const startTime = performance.now();
              const result = await pgClient.query(message.sql);
              const executionTimeMs = Math.round(performance.now() - startTime);
              sendMessage({
                type: "pg-query-result",
                id: message.id,
                rows: (result.rows ?? []) as Record<string, unknown>[],
                fields: (result.fields ?? []).map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
                rowCount: result.rowCount,
                command: result.command ?? "",
                executionTimeMs
              });
              break;
            }

            default:
              break;
          }
        } catch (err) {
          const pgErr = err as { message?: string; detail?: string; hint?: string };

          // If the failed query was inside a transaction, roll back so the
          // connection is not stuck in an aborted transaction state.
          try {
            await pgClient.query("ROLLBACK");
          } catch {
            // ROLLBACK fails if there was no active transaction — safe to ignore.
          }

          sendMessage({
            type: "pg-error",
            id: message.id,
            error: pgErr.message ?? "Query execution failed",
            detail: pgErr.detail,
            hint: pgErr.hint
          });
        }
      })
      .catch((err) => {
        logger.error(err, "Error processing data browser message");
      });
  });

  // Tunnel drop detection
  pgClient.on("error", (err) => {
    logger.error(err, "Data browser database connection error");
    sendSessionEnd(resolveEndReason(isNearSessionExpiry));
    onCleanup();
    socket.close();
  });

  pgClient.on("end", () => {
    sendSessionEnd(resolveEndReason(isNearSessionExpiry));
    onCleanup();
    socket.close();
  });

  return {
    cleanup: async () => {
      try {
        await pgClient.end();
      } catch (err) {
        logger.debug(err, "Error closing data browser pg client");
      }
    }
  };
};
