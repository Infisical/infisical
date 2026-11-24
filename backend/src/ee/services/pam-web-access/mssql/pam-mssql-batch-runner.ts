import { type Connection, Request } from "tedious";

import { DATA_EXPLORER_MAX_RESULT_BYTES, estimateRowBytes } from "../pam-web-access-fns";
import { MSSQL_REQUEST_TIMEOUT_MS } from "./pam-mssql-client";
import {
  formatMssqlValue,
  isLossyDecimal,
  resolveMssqlTypeName,
  splitMssqlBatches,
  uniqueColumnNames
} from "./pam-mssql-data-explorer-fns";

export const MAX_ROWS = 1000;
const MAX_INFO_MESSAGES = 50;
const MAX_INFO_MESSAGE_LENGTH = 1000;

export const QUERY_TIMEOUT_MESSAGE = `Query exceeded the ${MSSQL_REQUEST_TIMEOUT_MS / 1000} second limit and was cancelled`;

type TColumnMetadata = { colName: string; type: { name: string }; scale?: number; dataLength?: number };

type TResultSet = {
  names: string[];
  typeNames: string[];
  scales: (number | undefined)[];
  rows: Record<string, unknown>[];
  bytes: number;
  isTruncated: boolean;
  lossyColumns: Set<string>;
};

export type TBatchOutcome =
  | { kind: "none" }
  | {
      kind: "rows";
      rows: Record<string, unknown>[];
      fields: { name: string }[];
      isTruncated: boolean;
      lossyColumns: string[];
    }
  | { kind: "count"; rowCount: number };

export type TBatchRun = { outcome: TBatchOutcome; stoppedAtLimit: boolean; hiddenResultSets: number };

export type TBatchConnection = Pick<Connection, "execSqlBatch" | "cancel">;

export class MssqlScriptError extends Error {
  constructor(
    readonly original: unknown,
    readonly batchContext?: string
  ) {
    super(original instanceof Error ? original.message : String(original));
  }
}

// No SELECT-only row limit exists, so hitting the cap cancels the batch; tedious's requestTimeout ends at the first packet
export const runBatch = (conn: TBatchConnection, sql: string, previous: TBatchOutcome, timeoutMs: number) =>
  new Promise<TBatchRun>((resolve, reject) => {
    let outcome = previous;
    let current: TResultSet | null = null;
    let procResultKept = false;
    let stoppedAtLimit = false;
    let timedOut = false;
    let hiddenResultSets = 0;

    const toRowsOutcome = (rs: TResultSet): TBatchOutcome => ({
      kind: "rows",
      rows: rs.rows,
      fields: rs.names.map((name) => ({ name })),
      isTruncated: rs.isTruncated,
      lossyColumns: [...rs.lossyColumns]
    });

    const replaceOutcome = (next: TBatchOutcome) => {
      if (outcome.kind === "rows") hiddenResultSets += 1;
      outcome = next;
    };

    const timer = setTimeout(
      () => {
        timedOut = true;
        conn.cancel();
      },
      Math.max(timeoutMs, 0)
    );

    const request = new Request(sql, (err) => {
      clearTimeout(timer);
      if (stoppedAtLimit && (!err || (err as { code?: string }).code === "ECANCEL")) {
        if (current) replaceOutcome(toRowsOutcome(current));
        resolve({ outcome, stoppedAtLimit, hiddenResultSets });
        return;
      }
      if (timedOut) {
        reject(new Error(QUERY_TIMEOUT_MESSAGE));
        return;
      }
      if (err) reject(err);
      else resolve({ outcome, stoppedAtLimit, hiddenResultSets });
    });

    const stopAtLimit = () => {
      if (current) current.isTruncated = true;
      stoppedAtLimit = true;
      conn.cancel();
    };

    request.on("columnMetadata", (cols) => {
      const list = (Array.isArray(cols) ? cols : Object.values(cols)) as TColumnMetadata[];
      current = {
        names: uniqueColumnNames(list.map((c) => c.colName)),
        typeNames: list.map((c) => resolveMssqlTypeName(c.type.name, c.dataLength)),
        scales: list.map((c) => c.scale),
        rows: [],
        bytes: 0,
        isTruncated: false,
        lossyColumns: new Set()
      };
    });

    request.on("row", (columns: { value: unknown }[]) => {
      const rs = current;
      if (!rs || rs.isTruncated) return;
      if (rs.rows.length === MAX_ROWS) {
        stopAtLimit();
        return;
      }
      const row: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        if (isLossyDecimal(col.value, rs.typeNames[i], rs.scales[i])) rs.lossyColumns.add(rs.names[i]);
        row[rs.names[i]] = formatMssqlValue(col.value, rs.typeNames[i], rs.scales[i]);
      });
      rs.bytes += estimateRowBytes(row);
      if (rs.bytes > DATA_EXPLORER_MAX_RESULT_BYTES) {
        stopAtLimit();
        return;
      }
      rs.rows.push(row);
    });

    request.on("done", (rowCount: number | undefined) => {
      if (current) {
        replaceOutcome(toRowsOutcome(current));
        current = null;
      } else if (rowCount !== undefined) {
        replaceOutcome({ kind: "count", rowCount });
      }
    });

    // Like MySQL's CALL, a procedure shows its first result set
    request.on("doneInProc", (rowCount: number | undefined) => {
      if (current) {
        if (procResultKept) hiddenResultSets += 1;
        else replaceOutcome(toRowsOutcome(current));
        procResultKept = true;
        current = null;
      } else if (rowCount !== undefined && !procResultKept) {
        replaceOutcome({ kind: "count", rowCount });
      }
    });

    request.on("doneProc", () => {
      procResultKept = false;
    });

    conn.execSqlBatch(request);
  });

const ordinal = (from: number, to: number) => (from === to ? `batch ${from}` : `batches ${from}-${to}`);
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// Tells the user which GO batches ran when a script stops part way, since earlier batches are already committed
export const describeBatchStop = (index: number, total: number, verb: string): string | undefined => {
  if (total <= 1) return undefined;
  const after: string[] = [];
  if (index > 0) after.push(`${ordinal(1, index)} completed`);
  if (index < total - 1) after.push(`${ordinal(index + 2, total)} did not run`);
  const head = `Batch ${index + 1} of ${total} ${verb}.`;
  return after.length > 0 ? `${head} ${capitalize(after.join("; "))}.` : head;
};

const isCancellation = (err: unknown) =>
  (err as { code?: string })?.code === "ECANCEL" || (err as Error)?.message === QUERY_TIMEOUT_MESSAGE;

export type TScriptResult = { outcome: TBatchOutcome; messages: string[] };

export const runScript = async (
  conn: TBatchConnection & Pick<Connection, "on" | "removeListener">,
  sql: string,
  timeoutMs = MSSQL_REQUEST_TIMEOUT_MS
): Promise<TScriptResult> => {
  const batches = splitMssqlBatches(sql);
  const deadline = Date.now() + timeoutMs;
  const infoMessages: string[] = [];
  const onInfo = (info: { message?: string }) => {
    if (infoMessages.length < MAX_INFO_MESSAGES && info.message) {
      infoMessages.push(info.message.slice(0, MAX_INFO_MESSAGE_LENGTH));
    }
  };
  conn.on("infoMessage", onInfo);

  let outcome: TBatchOutcome = { kind: "none" };
  let hiddenResultSets = 0;
  let stoppedAtLimit = false;
  try {
    for (let i = 0; i < batches.length; i += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new MssqlScriptError(
          new Error(QUERY_TIMEOUT_MESSAGE),
          describeBatchStop(i, batches.length, "was not started")
        );
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        const run = await runBatch(conn, batches[i], outcome, remaining);
        hiddenResultSets += run.hiddenResultSets;
        outcome = run.outcome;
        if (run.stoppedAtLimit) {
          stoppedAtLimit = true;
          break;
        }
      } catch (err) {
        throw new MssqlScriptError(
          err,
          describeBatchStop(i, batches.length, isCancellation(err) ? "was cancelled" : "failed")
        );
      }
    }
  } finally {
    conn.removeListener("infoMessage", onInfo);
  }

  const messages = [...infoMessages];
  if (hiddenResultSets > 0) {
    messages.push(
      `${hiddenResultSets} earlier result ${hiddenResultSets === 1 ? "set is" : "sets are"} not shown. Run each query on its own to see it.`
    );
  }
  if (stoppedAtLimit) {
    messages.push(
      `Stopped after the first ${MAX_ROWS.toLocaleString("en-US")} rows. Statements after this query did not run.`
    );
  }
  if (outcome.kind === "rows" && outcome.lossyColumns.length > 0) {
    messages.push(
      `Some values in ${outcome.lossyColumns.join(", ")} are too large to show exactly. Select CONVERT(varchar(64), <column>) to see every digit.`
    );
  }
  return { outcome, messages };
};
