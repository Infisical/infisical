import { logger } from "@app/lib/logger";

import { type ControllerParams } from "../pam-data-explorer-session-handler";
import {
  DataExplorerClientMessageType,
  DataExplorerServerMessageType,
  type TConnectionController,
  type TTabScopedMessage
} from "../pam-data-explorer-ws-types";
import { MssqlScriptError, runScript } from "./pam-mssql-batch-runner";
import { connectMssql, extractMssqlErrorFields, queryRows } from "./pam-mssql-client";
import { extractLastCommand, extractSingleStatementCommand } from "./pam-mssql-data-explorer-fns";
import {
  getColumnsQuery,
  getForeignKeysQuery,
  getPrimaryKeysQuery,
  groupForeignKeys,
  type TForeignKeyColumnRow
} from "./pam-mssql-data-explorer-metadata";

export const createMssqlConnectionController = async (params: ControllerParams): Promise<TConnectionController> => {
  const { sessionId, connectionId, sendResponse, onUnexpectedTermination } = params;

  const conn = await connectMssql(params, 30_000);

  let disposing = false;

  conn.on("error", (err) => {
    if (disposing) return;
    logger.error(err, `MSSQL tab connection error [sessionId=${sessionId}] [connectionId=${connectionId}]`);
    disposing = true;
    onUnexpectedTermination(err.message || "Database connection error");
  });

  conn.on("end", () => {
    if (disposing) return;
    disposing = true;
    onUnexpectedTermination("Database connection ended");
  });

  // tedious tracks the server's transaction notices, so nothing is queried (or recorded) to learn this
  const isInTransaction = () => conn.inTransaction;

  // The user's transaction is left as SQL Server left it, as SSMS does; the badge shows whether it is still open
  const sendQueryError = (id: string, err: unknown) => {
    const original = err instanceof MssqlScriptError ? err.original : err;
    const { message, detail } = extractMssqlErrorFields(original);
    const batchContext = err instanceof MssqlScriptError ? err.batchContext : undefined;
    const messages = err instanceof MssqlScriptError && err.messages.length > 0 ? err.messages : undefined;
    const text = message ?? "Query execution failed";
    sendResponse({
      type: DataExplorerServerMessageType.Error,
      id,
      connectionId,
      transactionOpen: isInTransaction(),
      error: batchContext ? `${text}\n\n${batchContext}` : text,
      detail,
      messages
    });
  };

  let processingPromise: Promise<void> = Promise.resolve();

  const handleMessage = (message: TTabScopedMessage) => {
    if (message.type === DataExplorerClientMessageType.Cancel) {
      if (disposing) return;
      conn.cancel();
      return;
    }

    processingPromise = processingPromise
      .then(async () => {
        if (disposing) return;

        switch (message.type) {
          case DataExplorerClientMessageType.GetTableDetail: {
            try {
              const columnsQuery = getColumnsQuery(message.schema, message.table);
              const columns = await queryRows<{
                name: string;
                type: string;
                nullable: boolean;
                identityGeneration: string | null;
              }>(conn, columnsQuery.sql, columnsQuery.params);

              if (columns.length === 0) {
                sendResponse({
                  type: DataExplorerServerMessageType.Error,
                  id: message.id,
                  connectionId,
                  transactionOpen: isInTransaction(),
                  error: "Table not found or no metadata available"
                });
                break;
              }

              const pkQuery = getPrimaryKeysQuery(message.schema, message.table);
              const pkRows = await queryRows<{ name: string }>(conn, pkQuery.sql, pkQuery.params);
              const fkQuery = getForeignKeysQuery(message.schema, message.table);
              const fkRows = await queryRows<TForeignKeyColumnRow>(conn, fkQuery.sql, fkQuery.params);

              sendResponse({
                type: DataExplorerServerMessageType.TableDetail,
                id: message.id,
                connectionId,
                transactionOpen: isInTransaction(),
                data: {
                  columns,
                  primaryKeys: pkRows.map((r) => r.name),
                  foreignKeys: groupForeignKeys(fkRows)
                }
              });
            } catch (err) {
              sendQueryError(message.id, err);
            }
            break;
          }

          case DataExplorerClientMessageType.Query: {
            try {
              const startTime = performance.now();

              const { outcome, messages } = await runScript(conn, message.sql);

              const executionTimeMs = Math.round(performance.now() - startTime);
              const base = {
                type: DataExplorerServerMessageType.QueryResult,
                id: message.id,
                connectionId,
                transactionOpen: isInTransaction(),
                executionTimeMs,
                messages
              } as const;

              if (outcome.kind === "rows") {
                sendResponse({
                  ...base,
                  rows: outcome.rows,
                  fields: outcome.fields,
                  rowCount: outcome.rows.length,
                  isTruncated: outcome.isTruncated,
                  command: "SELECT"
                });
              } else {
                sendResponse({
                  ...base,
                  rows: [],
                  fields: [],
                  rowCount: outcome.kind === "count" ? outcome.rowCount : null,
                  isTruncated: false,
                  command:
                    outcome.kind === "count"
                      ? extractSingleStatementCommand(message.sql)
                      : extractLastCommand(message.sql)
                });
              }
            } catch (err) {
              sendQueryError(message.id, err);
            }
            break;
          }

          default:
            break;
        }
      })
      .catch((err) => {
        logger.error(err, `Error processing MSSQL message [sessionId=${sessionId}] [connectionId=${connectionId}]`);
      });
  };

  const dispose = () => {
    if (disposing) return;
    disposing = true;
    conn.close();
  };

  return {
    connectionId,
    nativeConnectionId: null,
    handleMessage,
    dispose,
    isDisposing: () => disposing
  };
};
