import mysql from "mysql2/promise";

import { logger } from "@app/lib/logger";

import { type ControllerParams } from "../pam-data-explorer-session-handler";
import {
  DataExplorerClientMessageType,
  DataExplorerServerMessageType,
  type TConnectionController,
  type TTabScopedMessage
} from "../pam-data-explorer-ws-types";
import { extractCommand, splitMysqlStatements } from "./pam-mysql-data-explorer-fns";
import { getTableDetailQuery } from "./pam-mysql-data-explorer-metadata";

const MAX_ROWS = 1000;

export const createMysqlConnectionController = async (params: ControllerParams): Promise<TConnectionController> => {
  const { relayPort, username, database, sessionId, connectionId, sendResponse, onUnexpectedTermination } = params;

  const conn = await mysql.createConnection({
    host: "localhost",
    port: relayPort,
    user: username,
    database: database || undefined,
    password: "",
    connectTimeout: 30_000,
    multipleStatements: false,
    typeCast: (field, next) => {
      if (field.type === "JSON") {
        return field.string();
      }
      if (field.type === "BIT" && field.length === 1) {
        const buf = field.buffer();
        if (!buf) return null;
        return buf[0] === 1 ? "true" : "false";
      }
      if (field.type === "TINY" && field.length === 1) {
        return field.string();
      }
      return next();
    }
  });

  const [pidRows] = await conn.execute<mysql.RowDataPacket[]>("SELECT CONNECTION_ID() AS pid");
  const backendPid = (pidRows[0]?.pid as number) ?? null;

  await conn.query(`SET SESSION max_execution_time = 30000, sql_select_limit = ${MAX_ROWS + 1}`);

  let isInTransaction = false;
  let disposing = false;

  const queryTransactionState = async () => {
    try {
      const [result] = await conn.query<mysql.ResultSetHeader>("DO 0");
      // eslint-disable-next-line no-bitwise
      isInTransaction = (result.serverStatus & 1) === 1;
    } catch {
      isInTransaction = false;
    }
  };

  const sendQueryError = async (id: string, err: unknown) => {
    const mysqlErr = err as { message?: string; sqlMessage?: string; code?: string };

    try {
      await conn.execute("ROLLBACK");
    } catch {
      // ROLLBACK fails if there was no active transaction
    }

    await queryTransactionState();

    sendResponse({
      type: DataExplorerServerMessageType.Error,
      id,
      connectionId,
      transactionOpen: isInTransaction,
      error: mysqlErr.sqlMessage ?? mysqlErr.message ?? "Query execution failed",
      detail: mysqlErr.code
    });
  };

  const cancelRunningQuery = async () => {
    if (!backendPid) return;
    let cancelConn: mysql.Connection | null = null;
    try {
      cancelConn = await mysql.createConnection({
        host: "localhost",
        port: relayPort,
        user: username,
        database: database || undefined,
        password: "",
        connectTimeout: 5_000
      });
      cancelConn.on("error" as never, () => {});
      await cancelConn.execute("KILL QUERY ?", [backendPid]);
    } catch (err) {
      logger.debug(err, `Failed to cancel MySQL query [sessionId=${sessionId}] [connectionId=${connectionId}]`);
    } finally {
      if (cancelConn) await cancelConn.end().catch(() => {});
    }
  };

  // max_execution_time only covers SELECTs; this guards DML/DDL with KILL QUERY on a timer
  const queryWithTimeout = async <T>(fn: () => Promise<T>, timeoutMs = 30_000): Promise<T> => {
    const timer = setTimeout(() => {
      void cancelRunningQuery();
    }, timeoutMs);
    try {
      return await fn();
    } finally {
      clearTimeout(timer);
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
              const [rows] = await conn.execute<mysql.RowDataPacket[]>(query.sql, query.values);
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              const rawDetail = rows[0]?.result;
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

              const stmts = splitMysqlStatements(message.sql);

              let lastRows: Record<string, unknown>[] = [];
              let lastFields: { name: string }[] = [];
              let lastRowCount: number | null = null;
              let lastCommand = "";
              let lastIsTruncated = false;

              for (const stmtSql of stmts) {
                // eslint-disable-next-line no-await-in-loop
                await conn.query(`SET SESSION sql_select_limit = ${MAX_ROWS + 1}`);
                // eslint-disable-next-line no-await-in-loop
                const [result, fields] = await queryWithTimeout(() => conn.query(stmtSql));

                if (Array.isArray(result)) {
                  const rows = result as mysql.RowDataPacket[];
                  lastIsTruncated = rows.length > MAX_ROWS;
                  lastRows = lastIsTruncated ? rows.slice(0, MAX_ROWS) : rows;
                  lastFields = (fields ?? []).map((f) => ({ name: f.name }));
                  lastRowCount = rows.length;
                  lastCommand = "SELECT";
                } else {
                  const header = result as mysql.ResultSetHeader;
                  lastRowCount = header.affectedRows;
                  lastCommand = extractCommand(stmtSql);
                  lastRows = [];
                  lastFields = [];
                  lastIsTruncated = false;
                }
              }

              // eslint-disable-next-line no-await-in-loop
              await queryTransactionState();

              const safeRows = lastRows.map((row) => {
                const out: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(row)) {
                  out[k] = Buffer.isBuffer(v) ? `\\x${v.toString("hex")}` : v;
                }
                return out;
              });

              const executionTimeMs = Math.round(performance.now() - startTime);
              sendResponse({
                type: DataExplorerServerMessageType.QueryResult,
                id: message.id,
                connectionId,
                rows: safeRows,
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
        logger.error(err, `Error processing MySQL message [sessionId=${sessionId}] [connectionId=${connectionId}]`);
      });
  };

  conn.on("error" as never, (err: Error) => {
    if (disposing) return;
    logger.error(err, `MySQL tab connection error [sessionId=${sessionId}] [connectionId=${connectionId}]`);
    disposing = true;
    onUnexpectedTermination(err.message || "Database connection error");
  });

  conn.on("end" as never, () => {
    if (disposing) return;
    disposing = true;
    onUnexpectedTermination("Database connection ended");
  });

  const dispose = () => {
    if (disposing) return;
    disposing = true;
    void conn.end().catch((err) => {
      logger.debug(err, `Error closing MySQL connection [sessionId=${sessionId}] [connectionId=${connectionId}]`);
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
