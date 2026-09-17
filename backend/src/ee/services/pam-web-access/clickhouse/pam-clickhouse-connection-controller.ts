import { type ClickHouseClient } from "@clickhouse/client";
import { randomUUID } from "crypto";

import { logger } from "@app/lib/logger";

import { type ControllerParams } from "../pam-data-explorer-session-handler";
import {
  DataExplorerClientMessageType,
  DataExplorerServerMessageType,
  type TConnectionController,
  type TTabScopedMessage
} from "../pam-data-explorer-ws-types";
import {
  clickhouseErrorFields,
  ClickhouseResultTooLargeError,
  isRelayGoneError,
  MAX_RESULT_BYTES,
  openRelayClient,
  readStreamText,
  withOneShotClient
} from "./pam-clickhouse-client";
import {
  extractCommand,
  MAX_ROWS,
  parseStatementBody,
  splitClickhouseStatements,
  TStatementResult
} from "./pam-clickhouse-data-explorer-fns";
import { COLUMNS_QUERY, TColumnRow, toColumns, toPrimaryKeys } from "./pam-clickhouse-data-explorer-metadata";

export const createClickhouseConnectionController = async (
  params: ControllerParams
): Promise<TConnectionController> => {
  const { relayPort, database, sessionId, connectionId, sendResponse, onUnexpectedTermination } = params;

  const client: ClickHouseClient = await openRelayClient({
    relayPort,
    database,
    sessionId: `${sessionId}-${connectionId}`
  });

  let disposing = false;
  let cancelled = false;
  let runningQueryId: string | null = null;
  let abortController: AbortController | null = null;

  // Aborting only drops this side of the request; the statement runs on until ClickHouse is told to kill it
  const cancelRunningStatement = () => {
    cancelled = true;
    abortController?.abort();
    const queryId = runningQueryId;
    if (!queryId) return;
    void withOneShotClient({ relayPort, database }, (killClient) =>
      killClient.command({
        query: "KILL QUERY WHERE query_id = {queryId:String}",
        query_params: { queryId }
      })
    ).catch((err) => {
      logger.debug(err, `Failed to kill ClickHouse query [sessionId=${sessionId}] [connectionId=${connectionId}]`);
    });
  };

  const sendQueryError = (id: string, err: unknown) => {
    // The tunnel is gone once the session is terminated, so the tab is closed rather than left waiting
    if (!disposing && isRelayGoneError(err)) {
      disposing = true;
      onUnexpectedTermination("Session ended");
      return;
    }

    const { message, detail } = clickhouseErrorFields(err);
    sendResponse({
      type: DataExplorerServerMessageType.Error,
      id,
      connectionId,
      transactionOpen: false,
      error: cancelled ? "Query cancelled" : (message ?? "Query execution failed"),
      detail: cancelled ? undefined : detail
    });
  };

  const runTableDetail = async (schema: string, table: string) => {
    const result = await client.query({
      query: COLUMNS_QUERY,
      format: "JSON",
      query_params: { schema, table }
    });
    const columns = (await result.json<TColumnRow>()).data;
    if (columns.length === 0) return null;

    return {
      columns: toColumns(columns),
      primaryKeys: toPrimaryKeys(columns),
      foreignKeys: []
    };
  };

  const runStatement = async (statementSql: string): Promise<TStatementResult> => {
    const queryId = randomUUID();
    abortController = new AbortController();
    runningQueryId = queryId;

    const { stream, summary } = await client.exec({
      query: statementSql,
      query_id: queryId,
      abort_signal: abortController.signal,
      clickhouse_settings: {
        default_format: "JSONCompact",
        max_result_rows: String(MAX_ROWS + 1),
        result_overflow_mode: "break",
        wait_end_of_query: 1
      }
    });

    const { text, truncated } = await readStreamText(stream, MAX_RESULT_BYTES);
    if (truncated) throw new ClickhouseResultTooLargeError(MAX_RESULT_BYTES);

    return parseStatementBody(text, summary);
  };

  const runQuery = async (sql: string) => {
    const startTime = performance.now();

    let last: TStatementResult = { rows: [], fields: [], rowCount: null, isTruncated: false };
    let lastCommand = "";

    try {
      for (const statementSql of splitClickhouseStatements(sql)) {
        lastCommand = extractCommand(statementSql);
        // eslint-disable-next-line no-await-in-loop
        last = await runStatement(statementSql);
      }
    } finally {
      runningQueryId = null;
      abortController = null;
    }

    return {
      ...last,
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
        cancelled = false;

        switch (message.type) {
          case DataExplorerClientMessageType.GetTableDetail: {
            try {
              const detail = await runTableDetail(message.schema, message.table);
              if (!detail) {
                sendResponse({
                  type: DataExplorerServerMessageType.Error,
                  id: message.id,
                  connectionId,
                  transactionOpen: false,
                  error: "Table not found or no metadata available"
                });
                break;
              }
              sendResponse({
                type: DataExplorerServerMessageType.TableDetail,
                id: message.id,
                connectionId,
                transactionOpen: false,
                data: detail
              });
            } catch (err) {
              sendQueryError(message.id, err);
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
                transactionOpen: false,
                ...result
              });
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
        logger.error(
          err,
          `Error processing ClickHouse message [sessionId=${sessionId}] [connectionId=${connectionId}]`
        );
      });
  };

  const dispose = () => {
    if (disposing) return;
    disposing = true;
    cancelRunningStatement();
    void client.close().catch((err) => {
      logger.debug(err, `Error closing ClickHouse client [sessionId=${sessionId}] [connectionId=${connectionId}]`);
    });
  };

  return {
    connectionId,
    nativeConnectionId: null,
    handleMessage,
    dispose,
    isDisposing: () => disposing
  };
};
