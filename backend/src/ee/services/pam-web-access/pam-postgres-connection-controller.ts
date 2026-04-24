import { parse as parseSql } from "libpg-query";
import pg from "pg";
import Cursor from "pg-cursor";

import { logger } from "@app/lib/logger";

import { getTableDetailQuery } from "./pam-postgres-data-explorer-metadata";
import {
  PostgresClientMessageType,
  PostgresServerMessageType,
  type TPostgresClientMessage,
  type TPostgresCorrelatedServerMessage
} from "./pam-postgres-ws-types";

type ControllerParams = {
  relayPort: number;
  username: string;
  database: string;
  sessionId: string;
  connectionId: string;
  sendResponse: (msg: TPostgresCorrelatedServerMessage) => void;
  onUnexpectedTermination: (reason: string) => void;
};

// Tab-scoped messages the controller handles. Metadata (get-schemas, get-tables)
// and lifecycle messages are handled at the multiplexer layer.
type TTabScopedMessage = Extract<
  TPostgresClientMessage,
  {
    type: PostgresClientMessageType.GetTableDetail | PostgresClientMessageType.Query | PostgresClientMessageType.Cancel;
  }
>;

export type TPostgresConnectionController = {
  connectionId: string;
  backendPid: number | null;
  handleMessage: (msg: TTabScopedMessage) => void;
  dispose: () => void;
  isDisposing: () => boolean;
};

// Type parser shared between the pg.Client and pg-cursor instances so all
// results — whether fetched via the simple query path or cursor — apply the
// same normalisation rules.
const pgTypes = {
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
};

export const createPostgresConnectionController = async (
  params: ControllerParams
): Promise<TPostgresConnectionController> => {
  const { relayPort, username, database, sessionId, connectionId, sendResponse, onUnexpectedTermination } = params;

  const pgClient = new pg.Client({
    host: "localhost",
    port: relayPort,
    user: username,
    database,
    password: "",
    ssl: false,
    connectionTimeoutMillis: 30_000,
    statement_timeout: 30_000,
    types: pgTypes
  });

  await pgClient.connect();

  const { rows: pidRows } = await pgClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  const backendPid = pidRows[0]?.pid ?? null;

  // Server-side transaction state — updated after every query so the client
  // always receives the authoritative value, including for multi-statement SQL.
  let isInTransaction = false;
  let disposing = false;

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
      connectionId,
      transactionOpen: false,
      error: pgErr.message ?? "Query execution failed",
      detail: pgErr.detail,
      hint: pgErr.hint
    });
  };

  // Cancel the currently running query via pg_cancel_backend.
  // Runs on a separate connection so it is not blocked by the sequential queue.
  const cancelRunningQuery = async () => {
    if (!backendPid) return;
    const cancelClient = new pg.Client({
      host: "localhost",
      port: relayPort,
      user: username,
      database,
      password: "",
      ssl: false,
      connectionTimeoutMillis: 5_000
    });
    // pg.Client is an EventEmitter; an unhandled 'error' would throw and
    // crash the Node process. Attach a no-op listener.
    cancelClient.on("error", (err) => {
      logger.debug(err, `Cancel client error [sessionId=${sessionId}] [connectionId=${connectionId}]`);
    });
    try {
      await cancelClient.connect();
      await cancelClient.query("SELECT pg_cancel_backend($1)", [backendPid]);
    } catch (err) {
      logger.debug(err, `Failed to cancel backend query [sessionId=${sessionId}] [connectionId=${connectionId}]`);
    } finally {
      await cancelClient.end().catch(() => {});
    }
  };

  // Sequential message processing to prevent concurrent query issues on the
  // same pg.Client. Each controller has its own queue.
  let processingPromise: Promise<void> = Promise.resolve();

  const handleMessage = (message: TTabScopedMessage) => {
    // Cancel is handled immediately outside the sequential queue so it can
    // interrupt a running query rather than waiting behind it.
    if (message.type === PostgresClientMessageType.Cancel) {
      if (disposing) return;
      void cancelRunningQuery();
      return;
    }

    processingPromise = processingPromise
      .then(async () => {
        if (disposing) return;

        switch (message.type) {
          case PostgresClientMessageType.GetTableDetail: {
            try {
              const query = getTableDetailQuery(message.schema, message.table);
              const result = await pgClient.query<{ result: string }>(query.text, query.values);
              const rawDetail = result.rows[0]?.result;
              if (!rawDetail) {
                sendResponse({
                  type: PostgresServerMessageType.Error,
                  id: message.id,
                  connectionId,
                  transactionOpen: isInTransaction,
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
                connectionId,
                transactionOpen: isInTransaction,
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
              const startTime = performance.now();
              const MAX_ROWS = 1000;

              // Split the SQL into individual statements using the real PostgreSQL C parser
              // (via libpg-query WASM). Each statement is then run through a pg-cursor with
              // an explicit row cap — the server sends at most MAX_ROWS+1 rows at the wire
              // level regardless of result set size, so memory usage is bounded.
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              const parsed = await parseSql(message.sql);
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              const stmtTexts = (parsed.stmts as Array<{ stmt_location?: number; stmt_len?: number }>).map((s) => {
                const location = s.stmt_location ?? 0;
                return s.stmt_len !== undefined
                  ? message.sql.slice(location, location + s.stmt_len)
                  : message.sql.slice(location).trim();
              });

              let lastRows: Record<string, unknown>[] = [];
              let lastFields: { name: string }[] = [];
              let lastRowCount: number | null = null;
              let lastCommand = "";
              let lastIsTruncated = false;

              for (const stmtSql of stmtTexts) {
                const cursor = pgClient.query(new Cursor(stmtSql.trim(), null, { types: pgTypes }));
                // eslint-disable-next-line no-await-in-loop
                const stmtRows = await cursor.read(MAX_ROWS + 1);
                const stmtIsTruncated = stmtRows.length > MAX_ROWS;
                if (stmtIsTruncated) stmtRows.splice(MAX_ROWS);
                // eslint-disable-next-line no-await-in-loop
                await cursor.close();

                // eslint-disable-next-line no-underscore-dangle
                const cursorResult = cursor._result;
                const cmd = (cursorResult.command ?? "").toUpperCase();
                if (cmd === "BEGIN" || cmd === "START") isInTransaction = true;
                if (cmd === "COMMIT" || cmd === "ROLLBACK") isInTransaction = false;

                lastRows = stmtRows;
                lastFields = (cursorResult.fields ?? []).map((f) => ({ name: f.name }));
                lastRowCount = cursorResult.rowCount;
                lastCommand = cursorResult.command ?? "";
                lastIsTruncated = stmtIsTruncated;
              }

              const executionTimeMs = Math.round(performance.now() - startTime);
              sendResponse({
                type: PostgresServerMessageType.QueryResult,
                id: message.id,
                connectionId,
                rows: lastRows,
                fields: lastFields,
                rowCount: lastRowCount,
                isTruncated: lastIsTruncated,
                transactionOpen: isInTransaction,
                command: lastCommand,
                executionTimeMs
              });
            } catch (err) {
              await sendQueryError(message.id, err);
            }
            break;
          }

          default:
            break;
        }
      })
      .catch((err) => {
        logger.error(err, `Error processing Postgres message [sessionId=${sessionId}] [connectionId=${connectionId}]`);
      });
  };

  // Server-initiated termination — pg.Client errors outside clean dispose.
  pgClient.on("error", (err) => {
    if (disposing) return;
    logger.error(err, `Tab connection error [sessionId=${sessionId}] [connectionId=${connectionId}]`);
    disposing = true;
    onUnexpectedTermination(err.message || "Database connection error");
  });

  pgClient.on("end", () => {
    if (disposing) return;
    disposing = true;
    onUnexpectedTermination("Database connection ended");
  });

  const dispose = () => {
    if (disposing) return;
    disposing = true;
    // Fire-and-forget: Postgres auto-rollbacks uncommitted txns on socket close
    // and cleans up backend PIDs when it next tries to write. No explicit
    // ROLLBACK needed — keeps dispose synchronous from the caller's view.
    void pgClient.end().catch((err) => {
      logger.debug(err, `Error closing pg client [sessionId=${sessionId}] [connectionId=${connectionId}]`);
    });
  };

  return {
    connectionId,
    backendPid,
    handleMessage,
    dispose,
    isDisposing: () => disposing
  };
};
