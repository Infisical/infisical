import pg from "pg";

import {
  TPostgresAccountCredentials,
  TPostgresResourceConnectionDetails
} from "@app/ee/services/pam-resource/postgres/postgres-resource-types";
import { logger } from "@app/lib/logger";

import { getSchemasQuery, getTableDetailQuery, getTablesQuery } from "./pam-postgres-data-browser-metadata";
import { PostgresClientMessageSchema, type TPostgresCorrelatedServerMessage } from "./pam-postgres-ws-types";
import { parseClientMessage, resolveEndReason } from "./pam-web-access-fns";
import { createPamSqlRepl } from "./pam-web-access-repl";
import { SessionEndReason, TSessionContext, TSessionHandlerResult } from "./pam-web-access-types";

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
    type: "ready",
    data: `Connected to ${resourceName} (${connectionDetails.database}) as ${credentials.username}\n\n`,
    prompt: "=> "
  });

  logger.info({ sessionId }, "Postgres web access session established");

  const sendResponse = (msg: TPostgresCorrelatedServerMessage) => {
    try {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(msg));
      }
    } catch (err) {
      logger.error(err, "Failed to send WebSocket message");
    }
  };

  // Shared error handler for correlated query messages
  const sendQueryError = async (id: string, err: unknown) => {
    const pgErr = err as { message?: string; detail?: string; hint?: string };

    // If the failed query was inside a transaction, roll back so the
    // connection is not stuck in an aborted transaction state.
    try {
      await pgClient.query("ROLLBACK");
    } catch {
      // ROLLBACK fails if there was no active transaction — safe to ignore.
    }

    sendResponse({
      type: "error",
      id,
      error: pgErr.message ?? "Query execution failed",
      detail: pgErr.detail,
      hint: pgErr.hint
    });
  };

  // Sequential message processing to prevent concurrent query issues
  let processingPromise = Promise.resolve();

  socket.on("message", (rawData: Buffer | ArrayBuffer | Buffer[]) => {
    processingPromise = processingPromise
      .then(async () => {
        const message = parseClientMessage(rawData, PostgresClientMessageSchema);
        if (!message) {
          sendMessage({
            type: "output",
            data: "Invalid message format\n",
            prompt: repl.getPrompt()
          });
          return;
        }

        switch (message.type) {
          case "get-schemas": {
            try {
              const query = getSchemasQuery();
              const result = await pgClient.query(query.text, query.values);
              sendResponse({
                type: "schemas",
                id: message.id,
                data: result.rows as { name: string }[]
              });
            } catch (err) {
              await sendQueryError(message.id, err);
            }
            break;
          }

          case "get-tables": {
            try {
              const query = getTablesQuery(message.schema);
              const result = await pgClient.query(query.text, query.values);
              sendResponse({
                type: "tables",
                id: message.id,
                data: result.rows as { name: string; tableType: string }[]
              });
            } catch (err) {
              await sendQueryError(message.id, err);
            }
            break;
          }

          case "get-table-detail": {
            try {
              const query = getTableDetailQuery(message.schema, message.table);
              const result = await pgClient.query<{ result: string }>(query.text, query.values);
              const rawDetail = result.rows[0]?.result;
              if (!rawDetail) {
                sendResponse({
                  type: "error",
                  id: message.id,
                  error: "Table not found or no metadata available"
                });
                break;
              }
              const detail =
                typeof rawDetail === "string"
                  ? (JSON.parse(rawDetail) as Record<string, unknown>)
                  : (rawDetail as unknown as Record<string, unknown>);
              sendResponse({
                type: "table-detail",
                id: message.id,
                data: detail as {
                  columns: {
                    name: string;
                    type: string;
                    nullable: boolean;
                    identityGeneration: string | null;
                  }[];
                  primaryKeys: string[];
                  foreignKeys: {
                    constraintName: string;
                    columns: string[];
                    targetSchema: string;
                    targetTable: string;
                    targetColumns: string[];
                  }[];
                }
              });
            } catch (err) {
              await sendQueryError(message.id, err);
            }
            break;
          }

          case "query": {
            try {
              // Multi-statement SQL (transactions) is executed via PostgreSQL's simple query
              // protocol, which returns only the last statement's result. For transaction-wrapped
              // batches (BEGIN;...;COMMIT;), the result is from COMMIT (no rows/fields).
              const startTime = performance.now();
              const result = await pgClient.query(message.sql);
              const executionTimeMs = Math.round(performance.now() - startTime);
              sendResponse({
                type: "query-result",
                id: message.id,
                rows: (result.rows ?? []) as Record<string, unknown>[],
                fields: (result.fields ?? []).map((f) => ({ name: f.name })),
                rowCount: result.rowCount,
                command: result.command ?? "",
                executionTimeMs
              });
            } catch (err) {
              await sendQueryError(message.id, err);
            }
            break;
          }

          case "control": {
            if (message.data === "quit") {
              sendSessionEnd(SessionEndReason.UserQuit);
              onCleanup();
              socket.close();
              return;
            }
            if (message.data === "clear-buffer") {
              repl.clearBuffer();
            }
            break;
          }

          case "input": {
            const replResult = await repl.processInput(message.data);

            if (replResult.shouldClose) {
              sendSessionEnd(SessionEndReason.UserQuit);
              onCleanup();
              socket.close();
              return;
            }

            sendMessage({
              type: "output",
              data: replResult.output,
              prompt: replResult.prompt
            });
            break;
          }

          default:
            break;
        }
      })
      .catch((err) => {
        logger.error(err, "Error processing Postgres message");
        sendMessage({
          type: "output",
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
