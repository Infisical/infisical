import { parse as parseSql } from "libpg-query";
import pg from "pg";
import Cursor from "pg-cursor";

import { logger } from "@app/lib/logger";

import {
  DataExplorerClientMessageType,
  DataExplorerServerMessageType,
  type TConnectionController,
  type TDataExplorerServerMessage,
  type TTabScopedMessage
} from "../pam-data-explorer-ws-types";
import { getTableDetailQuery } from "./pam-postgres-data-explorer-metadata";

type ControllerParams = {
  relayPort: number;
  username: string;
  database?: string;
  sessionId: string;
  connectionId: string;
  sendResponse: (msg: TDataExplorerServerMessage) => void;
  onUnexpectedTermination: (reason: string) => void;
};

const pgTypes = {
  getTypeParser: (oid: number) => {
    if (oid === 16)
      return (val: string | Buffer) => {
        const raw = typeof val === "string" ? val : val.toString("utf8");
        return raw === "t" ? "true" : "false";
      };
    return (val: string | Buffer) => (typeof val === "string" ? val : val.toString("hex"));
  }
};

export const createPostgresConnectionController = async (params: ControllerParams): Promise<TConnectionController> => {
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

  let isInTransaction = false;
  let disposing = false;

  const sendQueryError = async (id: string, err: unknown) => {
    const pgErr = err as { message?: string; detail?: string; hint?: string };

    try {
      await pgClient.query("ROLLBACK");
    } catch {
      // ROLLBACK fails if there was no active transaction
    }

    isInTransaction = false;

    sendResponse({
      type: DataExplorerServerMessageType.Error,
      id,
      connectionId,
      transactionOpen: false,
      error: pgErr.message ?? "Query execution failed",
      detail: pgErr.detail,
      hint: pgErr.hint
    });
  };

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

  let processingPromise: Promise<void> = Promise.resolve();

  const handleMessage = (message: TTabScopedMessage) => {
    if (message.type === DataExplorerClientMessageType.Cancel) {
      if (disposing) return;
      void cancelRunningQuery();
      return;
    }

    processingPromise = processingPromise
      .then(async () => {
        if (disposing) return;

        switch (message.type) {
          case DataExplorerClientMessageType.GetTableDetail: {
            try {
              const query = getTableDetailQuery(message.schema, message.table);
              const result = await pgClient.query<{ result: string }>(query.text, query.values);
              const rawDetail = result.rows[0]?.result;
              if (!rawDetail) {
                sendResponse({
                  type: DataExplorerServerMessageType.Error,
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
                type: DataExplorerServerMessageType.TableDetail,
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

          case DataExplorerClientMessageType.Query: {
            try {
              const startTime = performance.now();
              const MAX_ROWS = 1000;

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
                type: DataExplorerServerMessageType.QueryResult,
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
