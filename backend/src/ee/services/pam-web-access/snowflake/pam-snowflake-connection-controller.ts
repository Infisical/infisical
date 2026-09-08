import snowflake from "snowflake-sdk";

import { logger } from "@app/lib/logger";
import { executeSnowflakeSql } from "@app/services/app-connection/snowflake";

import { type ControllerParams } from "../pam-data-explorer-session-handler";
import {
  DataExplorerClientMessageType,
  DataExplorerServerMessageType,
  type TConnectionController,
  type TTabScopedMessage
} from "../pam-data-explorer-ws-types";
import { extractCommand, nextTransactionState, splitSnowflakeStatements } from "./pam-snowflake-data-explorer-fns";
import {
  COLUMNS_QUERY,
  showImportedKeysQuery,
  showPrimaryKeysQuery,
  TColumnRow,
  toColumns,
  toForeignKeys,
  toPrimaryKeys
} from "./pam-snowflake-data-explorer-metadata";
import { snowflakeAccountOf } from "./pam-snowflake-metadata";
import { connectThroughRelay } from "./pam-snowflake-relay-client";

const MAX_ROWS = 1000;

const readRows = (
  statement: snowflake.RowStatement
): Promise<{ rows: Record<string, unknown>[]; truncated: boolean }> =>
  new Promise((resolve, reject) => {
    const rows: Record<string, unknown>[] = [];
    let truncated = false;
    const stream = statement.streamRows();

    stream.on("data", (row: Record<string, unknown>) => {
      if (rows.length < MAX_ROWS) {
        rows.push(row);
        return;
      }
      truncated = true;
      stream.destroy();
      resolve({ rows, truncated });
    });
    stream.on("error", (err) => {
      if (truncated) resolve({ rows, truncated });
      else reject(err);
    });
    stream.on("end", () => resolve({ rows, truncated }));
  });

export const createSnowflakeConnectionController = async (params: ControllerParams): Promise<TConnectionController> => {
  const { sessionId, connectionId, sendResponse, onUnexpectedTermination } = params;

  const client = await connectThroughRelay(params.relayPort, snowflakeAccountOf(params));

  let isInTransaction = false;
  let disposing = false;
  let runningStatement: snowflake.RowStatement | null = null;

  const execute = (sqlText: string): Promise<snowflake.RowStatement> =>
    new Promise((resolve, reject) => {
      runningStatement = client.execute({
        sqlText,
        streamResult: true,
        complete: (err, statement) => {
          if (err) reject(err);
          else resolve(statement as snowflake.RowStatement);
        }
      }) as snowflake.RowStatement;
    });

  const cancelRunningStatement = () => {
    const statement = runningStatement;
    if (!statement) return;
    statement.cancel((err) => {
      if (err) {
        logger.debug(err, `Failed to cancel Snowflake query [sessionId=${sessionId}] [connectionId=${connectionId}]`);
      }
    });
  };

  const sendQueryError = async (id: string, err: unknown) => {
    // The tunnel is gone once the session is terminated, so the tab is closed rather than left waiting
    if (!disposing && !client.isUp()) {
      disposing = true;
      onUnexpectedTermination("Session ended");
      return;
    }

    // Snowflake leaves a failed statement's transaction open, holding its locks until the session ends
    if (isInTransaction) {
      try {
        await executeSnowflakeSql(client, "ROLLBACK");
      } catch {
        // nothing to roll back
      }
      isInTransaction = false;
    }

    sendResponse({
      type: DataExplorerServerMessageType.Error,
      id,
      connectionId,
      transactionOpen: isInTransaction,
      error: (err as Error)?.message ?? "Query execution failed",
      detail: (err as { sqlState?: string })?.sqlState
    });
  };

  const runTableDetail = async (schema: string, table: string) => {
    const columns = await executeSnowflakeSql<TColumnRow>(client, COLUMNS_QUERY, [schema, table]);
    if (columns.length === 0) return null;

    const primaryKeyRows = await executeSnowflakeSql(client, showPrimaryKeysQuery(schema, table));
    const importedKeyRows = await executeSnowflakeSql(client, showImportedKeysQuery(schema, table));

    return {
      columns: toColumns(columns),
      primaryKeys: toPrimaryKeys(primaryKeyRows),
      foreignKeys: toForeignKeys(importedKeyRows)
    };
  };

  const runQuery = async (sql: string) => {
    const startTime = performance.now();

    let lastRows: Record<string, unknown>[] = [];
    let lastFields: { name: string }[] = [];
    let lastRowCount: number | null = null;
    let lastCommand = "";
    let lastIsTruncated = false;

    try {
      for (const statementSql of splitSnowflakeStatements(sql)) {
        // eslint-disable-next-line no-await-in-loop
        const statement = await execute(statementSql);
        // eslint-disable-next-line no-await-in-loop
        const { rows, truncated } = await readRows(statement);

        lastCommand = extractCommand(statementSql);
        isInTransaction = nextTransactionState(lastCommand, isInTransaction);
        lastRows = rows;
        lastFields = (statement.getColumns() ?? []).map((column) => ({ name: column.getName() }));
        // The driver reports -1, not undefined, when nothing was updated, so a SELECT falls through
        const updatedRows = statement.getNumUpdatedRows();
        lastRowCount =
          typeof updatedRows === "number" && updatedRows >= 0 ? updatedRows : (statement.getNumRows() ?? null);
        lastIsTruncated = truncated;
      }
    } finally {
      runningStatement = null;
    }

    return {
      rows: lastRows,
      fields: lastFields,
      rowCount: lastRowCount,
      isTruncated: lastIsTruncated,
      command: lastCommand,
      executionTimeMs: Math.round(performance.now() - startTime)
    };
  };

  let processingPromise: Promise<void> = Promise.resolve();

  const handleMessage = (message: TTabScopedMessage) => {
    if (message.type === DataExplorerClientMessageType.Cancel) {
      if (disposing) return;
      cancelRunningStatement();
      return;
    }

    processingPromise = processingPromise
      .then(async () => {
        if (disposing) return;

        switch (message.type) {
          case DataExplorerClientMessageType.GetTableDetail: {
            try {
              const detail = await runTableDetail(message.schema, message.table);
              if (!detail) {
                sendResponse({
                  type: DataExplorerServerMessageType.Error,
                  id: message.id,
                  connectionId,
                  transactionOpen: isInTransaction,
                  error: "Table not found or no metadata available"
                });
                break;
              }
              sendResponse({
                type: DataExplorerServerMessageType.TableDetail,
                id: message.id,
                connectionId,
                transactionOpen: isInTransaction,
                data: detail
              });
            } catch (err) {
              await sendQueryError(message.id, err);
            }
            break;
          }

          case DataExplorerClientMessageType.Query: {
            try {
              const result = await runQuery(message.sql);
              sendResponse({
                type: DataExplorerServerMessageType.QueryResult,
                id: message.id,
                connectionId,
                transactionOpen: isInTransaction,
                ...result
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
        logger.error(err, `Error processing Snowflake message [sessionId=${sessionId}] [connectionId=${connectionId}]`);
      });
  };

  const dispose = () => {
    if (disposing) return;
    disposing = true;
    cancelRunningStatement();
    client.destroy(() => {});
  };

  return {
    connectionId,
    // Snowflake has no numeric backend id
    nativeConnectionId: null,
    handleMessage,
    dispose,
    isDisposing: () => disposing
  };
};
