import pg from "pg";

import {
  TPostgresAccountCredentials,
  TPostgresResourceConnectionDetails
} from "@app/ee/services/pam-resource/postgres/postgres-resource-types";
import { logger } from "@app/lib/logger";

import { getSchemasQuery, getTableDetailQuery, getTablesQuery } from "./pam-postgres-data-browser-metadata";
import { createPamSqlRepl } from "./pam-web-access-repl";
import {
  parseDataBrowserClientMessage,
  parseWsClientMessage,
  resolveEndReason,
  SessionEndReason,
  TDataBrowserServerMessage,
  TSessionContext,
  TSessionHandlerResult,
  WsMessageType
} from "./pam-web-access-types";

type TPostgresSessionParams = {
  connectionDetails: TPostgresResourceConnectionDetails;
  credentials: TPostgresAccountCredentials;
};

export const handlePostgresSession = async (
  ctx: TSessionContext,
  params: TPostgresSessionParams
): Promise<TSessionHandlerResult> => {
  const { socket, relayPort, resourceName, sessionId, sendMessage, sendSessionEnd, isNearSessionExpiry, onCleanup } =
    ctx;
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
    types: {
      getTypeParser: () => (val: string | Buffer) => (typeof val === "string" ? val : val.toString("hex"))
    }
  });

  await pgClient.connect();

  const repl = createPamSqlRepl(pgClient);

  sendMessage({
    type: WsMessageType.Ready,
    data: `Connected to ${resourceName} (${connectionDetails.database}) as ${credentials.username}\n\n`,
    prompt: "=> "
  });

  logger.info({ sessionId }, "Postgres web access session established");

  const sendDataBrowserResponse = (msg: TDataBrowserServerMessage) => {
    try {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(msg));
      }
    } catch (err) {
      logger.error(err, "Failed to send data browser WebSocket message");
    }
  };

  // Sequential message processing to prevent concurrent query issues
  let processingPromise = Promise.resolve();

  socket.on("message", (rawData: Buffer | ArrayBuffer | Buffer[]) => {
    processingPromise = processingPromise
      .then(async () => {
        // Try data-browser message first (pg-* prefixed types)
        const dbMessage = parseDataBrowserClientMessage(rawData);
        if (dbMessage) {
          try {
            switch (dbMessage.type) {
              case "pg-get-schemas": {
                const query = getSchemasQuery();
                const result = await pgClient.query(query.text, query.values);
                sendDataBrowserResponse({
                  type: "pg-schemas",
                  id: dbMessage.id,
                  data: result.rows as { name: string }[]
                });
                break;
              }

              case "pg-get-tables": {
                const query = getTablesQuery(dbMessage.schema);
                const result = await pgClient.query(query.text, query.values);
                sendDataBrowserResponse({
                  type: "pg-tables",
                  id: dbMessage.id,
                  data: result.rows as { name: string; tableType: string }[]
                });
                break;
              }

              case "pg-get-table-detail": {
                const query = getTableDetailQuery(dbMessage.schema, dbMessage.table);
                const result = await pgClient.query<{ result: string }>(query.text, query.values);
                const rawDetail = result.rows[0]?.result;
                if (!rawDetail) {
                  sendDataBrowserResponse({
                    type: "pg-error",
                    id: dbMessage.id,
                    error: "Table not found or no metadata available"
                  });
                  break;
                }
                const detail =
                  typeof rawDetail === "string"
                    ? (JSON.parse(rawDetail) as Record<string, unknown>)
                    : (rawDetail as unknown as Record<string, unknown>);
                sendDataBrowserResponse({
                  type: "pg-table-detail",
                  id: dbMessage.id,
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
                const result = await pgClient.query(dbMessage.sql);
                const executionTimeMs = Math.round(performance.now() - startTime);
                sendDataBrowserResponse({
                  type: "pg-query-result",
                  id: dbMessage.id,
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

            sendDataBrowserResponse({
              type: "pg-error",
              id: dbMessage.id,
              error: pgErr.message ?? "Query execution failed",
              detail: pgErr.detail,
              hint: pgErr.hint
            });
          }
          return;
        }

        // Otherwise try terminal message
        const message = parseWsClientMessage(rawData);
        if (!message) {
          sendMessage({
            type: WsMessageType.Output,
            data: "Invalid message format\n",
            prompt: repl.getPrompt()
          });
          return;
        }

        if (message.type === WsMessageType.Control) {
          if (message.data === "quit") {
            sendSessionEnd(SessionEndReason.UserQuit);
            onCleanup();
            socket.close();
            return;
          }
          if (message.data === "clear-buffer") {
            repl.clearBuffer();
            return;
          }
          return;
        }

        if (message.type === WsMessageType.Input) {
          const replResult = await repl.processInput(message.data);

          if (replResult.shouldClose) {
            sendSessionEnd(SessionEndReason.UserQuit);
            onCleanup();
            socket.close();
            return;
          }

          sendMessage({
            type: WsMessageType.Output,
            data: replResult.output,
            prompt: replResult.prompt
          });
        }
      })
      .catch((err) => {
        logger.error(err, "Error processing Postgres message");
        sendMessage({
          type: WsMessageType.Output,
          data: "Internal error\n",
          prompt: "=> "
        });
      });
  });

  // Tunnel drop detection
  pgClient.on("error", (err) => {
    logger.error(err, "Database connection error");
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
        logger.debug(err, "Error closing pg client");
      }
    }
  };
};
