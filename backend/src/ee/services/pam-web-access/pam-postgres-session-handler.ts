import pg from "pg";

import {
  TPostgresAccountCredentials,
  TPostgresResourceConnectionDetails
} from "@app/ee/services/pam-resource/postgres/postgres-resource-types";
import { logger } from "@app/lib/logger";

import { getSchemasQuery, getTableDetailQuery, getTablesQuery } from "./pam-postgres-data-explorer-metadata";
import {
  PostgresClientMessageSchema,
  PostgresClientMessageType,
  PostgresServerMessageType,
  type TPostgresCorrelatedServerMessage
} from "./pam-postgres-ws-types";
import { parseClientMessage, resolveEndReason } from "./pam-web-access-fns";
import { createPamSqlRepl } from "./pam-web-access-repl";
import {
  SessionEndReason,
  TerminalServerMessageType,
  TSessionContext,
  TSessionHandlerResult
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
      getTypeParser: (oid: number) => {
        // Boolean (OID 16): Postgres wire protocol sends 't'/'f' — expand to 'true'/'false'
        // so the Data Explorer UI displays human-readable literals.
        if (oid === 16)
          return (val: string | Buffer) => {
            const raw = typeof val === "string" ? val : val.toString("utf8");
            return raw === "t" ? "true" : "false";
          };
        return (val: string | Buffer) => (typeof val === "string" ? val : val.toString("hex"));
      }
    }
  });

  await pgClient.connect();

  const { rows: pidRows } = await pgClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  const backendPid = pidRows[0]?.pid;

  const repl = createPamSqlRepl(pgClient);

  sendMessage({
    type: TerminalServerMessageType.Ready,
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

  // Server-side transaction state — updated after every query so the client
  // always receives the authoritative value, including for multi-statement SQL.
  let isInTransaction = false;

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

    isInTransaction = false;

    sendResponse({
      type: PostgresServerMessageType.Error,
      id,
      error: pgErr.message ?? "Query execution failed",
      detail: pgErr.detail,
      hint: pgErr.hint
    });
  };

  // Cancel the currently running query via pg_cancel_backend.
  // Runs on a separate connection so it is not blocked by the sequential queue.
  const cancelRunningQuery = async () => {
    if (!backendPid) return;
    const pid = backendPid;
    const cancelClient = new pg.Client({
      host: "localhost",
      port: relayPort,
      user: credentials.username,
      database: connectionDetails.database,
      password: "",
      ssl: false,
      connectionTimeoutMillis: 5_000
    });
    try {
      await cancelClient.connect();
      await cancelClient.query("SELECT pg_cancel_backend($1)", [pid]);
    } catch (err) {
      logger.debug(err, "Failed to cancel backend query");
    } finally {
      await cancelClient.end().catch(() => {});
    }
  };

  // Sequential message processing to prevent concurrent query issues
  let processingPromise = Promise.resolve();

  socket.on("message", (rawData: Buffer | ArrayBuffer | Buffer[]) => {
    const message = parseClientMessage(rawData, PostgresClientMessageSchema);

    // Cancel is handled immediately outside the sequential queue so it can
    // interrupt a running query rather than waiting behind it.
    if (message?.type === PostgresClientMessageType.Cancel) {
      void cancelRunningQuery();
      return;
    }

    processingPromise = processingPromise
      .then(async () => {
        if (!message) {
          sendMessage({
            type: TerminalServerMessageType.Output,
            data: "Invalid message format\n",
            prompt: repl.getPrompt()
          });
          return;
        }

        switch (message.type) {
          case PostgresClientMessageType.GetSchemas: {
            try {
              const query = getSchemasQuery();
              const result = await pgClient.query(query.text, query.values);
              sendResponse({
                type: PostgresServerMessageType.Schemas,
                id: message.id,
                data: result.rows as { name: string }[]
              });
            } catch (err) {
              await sendQueryError(message.id, err);
            }
            break;
          }

          case PostgresClientMessageType.GetTables: {
            try {
              const query = getTablesQuery(message.schema);
              const result = await pgClient.query(query.text, query.values);
              sendResponse({
                type: PostgresServerMessageType.Tables,
                id: message.id,
                data: result.rows as { name: string; tableType: string }[]
              });
            } catch (err) {
              await sendQueryError(message.id, err);
            }
            break;
          }

          case PostgresClientMessageType.GetTableDetail: {
            try {
              const query = getTableDetailQuery(message.schema, message.table);
              const result = await pgClient.query<{ result: string }>(query.text, query.values);
              const rawDetail = result.rows[0]?.result;
              if (!rawDetail) {
                sendResponse({
                  type: PostgresServerMessageType.Error,
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
                type: PostgresServerMessageType.TableDetail,
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

          case PostgresClientMessageType.Query: {
            try {
              // node-postgres returns an array of QueryResult objects when the SQL contains
              // multiple statements (simple query protocol). We take the last result so the
              // caller always sees a single consistent response — same behaviour as psql.
              const startTime = performance.now();
              const rawResult = (await pgClient.query(message.sql)) as
                | pg.QueryResult<Record<string, unknown>>
                | pg.QueryResult<Record<string, unknown>>[];
              const executionTimeMs = Math.round(performance.now() - startTime);
              const MAX_ROWS = 1000;
              // Scan all results to track transaction state accurately for multi-statement SQL.
              // e.g. "BEGIN; INSERT INTO foo VALUES (1);" — last command is INSERT, not BEGIN,
              // so checking only the last result would leave isInTransaction false incorrectly.
              const allResults = Array.isArray(rawResult) ? rawResult : [rawResult];
              for (const r of allResults) {
                const cmd = (r.command ?? "").toUpperCase();
                if (cmd === "BEGIN" || cmd === "START") isInTransaction = true;
                if (cmd === "COMMIT" || cmd === "ROLLBACK") isInTransaction = false;
              }
              const result = allResults[allResults.length - 1];
              const allRows = result.rows ?? [];
              const isTruncated = allRows.length > MAX_ROWS;
              sendResponse({
                type: PostgresServerMessageType.QueryResult,
                id: message.id,
                rows: allRows.slice(0, MAX_ROWS),
                fields: (result.fields ?? []).map((f) => ({ name: f.name })),
                rowCount: result.rowCount,
                isTruncated,
                transactionOpen: isInTransaction,
                command: result.command ?? "",
                executionTimeMs
              });
            } catch (err) {
              await sendQueryError(message.id, err);
            }
            break;
          }

          case PostgresClientMessageType.Control: {
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

          case PostgresClientMessageType.Input: {
            const replResult = await repl.processInput(message.data);

            if (replResult.shouldClose) {
              sendSessionEnd(SessionEndReason.UserQuit);
              onCleanup();
              socket.close();
              return;
            }

            sendMessage({
              type: TerminalServerMessageType.Output,
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
          type: TerminalServerMessageType.Output,
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
