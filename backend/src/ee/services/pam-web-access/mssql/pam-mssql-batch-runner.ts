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
const MAX_SERVER_ERRORS = 50;
const MAX_MESSAGE_LENGTH = 1000;

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

export type TResultLimit = "rows" | "bytes";

export type TBatchRun = {
  outcome: TBatchOutcome;
  stoppedAtLimit: TResultLimit | null;
  hiddenResultSets: number;
};

export type TBatchConnection = Pick<Connection, "execSqlBatch" | "cancel">;

export class MssqlScriptError extends Error {
  constructor(
    readonly original: unknown,
    readonly batchContext?: string,
    readonly messages: string[] = []
  ) {
    super(original instanceof Error ? original.message : String(original));
  }
}

const estimateRawRowBytes = (columns: { value: unknown }[]) =>
  columns.reduce((sum, { value }) => {
    if (typeof value === "string") return sum + value.length;
    if (Buffer.isBuffer(value)) return sum + value.length * 2;
    return sum;
  }, 0);

// No SELECT-only row limit exists, so hitting the cap cancels the batch; tedious's requestTimeout ends at the first packet
export const runBatch = (conn: TBatchConnection, sql: string, previous: TBatchOutcome, timeoutMs: number) =>
  new Promise<TBatchRun>((resolve, reject) => {
    let outcome = previous;
    let current: TResultSet | null = null;
    let procResultKept = false;
    let stoppedAtLimit: TResultLimit | null = null;
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
      // After the cancel tedious reports ECANCEL or an earlier server error, which runScript has already collected
      if (stoppedAtLimit && !timedOut) {
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

    const stopAtLimit = (limit: TResultLimit) => {
      if (current) current.isTruncated = true;
      stoppedAtLimit = limit;
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
      if (!rs || rs.isTruncated || procResultKept) return;
      if (rs.rows.length === MAX_ROWS) {
        stopAtLimit("rows");
        return;
      }
      // Checked before formatting, since a row of several large cells can outgrow a JS string once formatted
      if (rs.bytes + estimateRawRowBytes(columns) > DATA_EXPLORER_MAX_RESULT_BYTES) {
        stopAtLimit("bytes");
        return;
      }
      const row: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        if (isLossyDecimal(col.value, rs.typeNames[i], rs.scales[i])) rs.lossyColumns.add(rs.names[i]);
        row[rs.names[i]] = formatMssqlValue(col.value, rs.typeNames[i], rs.scales[i]);
      });
      rs.bytes += estimateRowBytes(row);
      if (rs.bytes > DATA_EXPLORER_MAX_RESULT_BYTES) {
        stopAtLimit("bytes");
        return;
      }
      rs.rows.push(row);
    });

    // A trigger's result set ends without a doneProc, so a finished top-level statement also ends any procedure
    request.on("done", (rowCount: number | undefined) => {
      procResultKept = false;
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

type TServerError = { message: string; number?: number; class?: number; state?: number };

const describeServerError = (e: TServerError) =>
  e.number === undefined ? e.message : `Msg ${e.number}, Level ${e.class ?? 0}, State ${e.state ?? 0}: ${e.message}`;

const toRequestError = (e: TServerError) => Object.assign(new Error(e.message), e);

export const runScript = async (
  conn: TBatchConnection & Pick<Connection, "on" | "removeListener">,
  sql: string,
  timeoutMs = MSSQL_REQUEST_TIMEOUT_MS
): Promise<TScriptResult> => {
  const batches = splitMssqlBatches(sql);
  const deadline = Date.now() + timeoutMs;
  const log: { text: string; isError: boolean }[] = [];
  const infoMessages = () => log.filter((m) => !m.isError).map((m) => m.text);
  const allMessages = () => log.map((m) => m.text);
  let infoCount = 0;
  let firstError: TServerError | undefined;
  let errorCount = 0;
  let tooManyErrors = false;
  const onInfo = (info: { message?: string }) => {
    if (infoCount < MAX_INFO_MESSAGES && info.message) {
      infoCount += 1;
      log.push({ text: info.message.slice(0, MAX_MESSAGE_LENGTH), isError: false });
    }
  };
  // T-SQL keeps going after most errors and tedious rebuilds its AggregateError on each one, so a loop of them is cut off
  const onError = (token: TServerError) => {
    if (tooManyErrors) return;
    if (errorCount === MAX_SERVER_ERRORS) {
      tooManyErrors = true;
      conn.cancel();
      return;
    }
    const error = { ...token, message: (token.message ?? "").slice(0, MAX_MESSAGE_LENGTH) };
    firstError ??= error;
    errorCount += 1;
    log.push({ text: describeServerError(error), isError: true });
  };
  conn.on("infoMessage", onInfo);
  conn.on("errorMessage", onError);

  let outcome: TBatchOutcome = { kind: "none" };
  let hiddenResultSets = 0;
  let stoppedAtLimit: TResultLimit | null = null;
  let stoppedBeforeBatch = false;
  try {
    for (let i = 0; i < batches.length; i += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new MssqlScriptError(
          new Error(QUERY_TIMEOUT_MESSAGE),
          describeBatchStop(i, batches.length, "was not started"),
          allMessages()
        );
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        const run = await runBatch(conn, batches[i], outcome, remaining);
        hiddenResultSets += run.hiddenResultSets;
        outcome = run.outcome;
        if (run.stoppedAtLimit) {
          stoppedAtLimit = run.stoppedAtLimit;
          stoppedBeforeBatch = i < batches.length - 1;
          break;
        }
      } catch (err) {
        if (tooManyErrors) {
          const context = describeBatchStop(i, batches.length, "failed");
          throw new MssqlScriptError(
            toRequestError(firstError as TServerError),
            [`Stopped after ${MAX_SERVER_ERRORS} errors.`, context].filter(Boolean).join(" "),
            allMessages()
          );
        }
        // A cancel or timeout is reported in place of the server errors, so those are listed with the messages
        const cancelled = isCancellation(err);
        throw new MssqlScriptError(
          err,
          describeBatchStop(i, batches.length, cancelled ? "was cancelled" : "failed"),
          cancelled ? allMessages() : infoMessages()
        );
      }
    }
  } finally {
    conn.removeListener("infoMessage", onInfo);
    conn.removeListener("errorMessage", onError);
  }

  // runBatch ignores the request error once a limit stops a batch, so its server errors are only listed here
  const messages = allMessages();
  if (hiddenResultSets > 0) {
    messages.push(
      `${hiddenResultSets} other result ${hiddenResultSets === 1 ? "set is" : "sets are"} not shown. The SQL editor shows one result set per run.`
    );
  }
  if (stoppedAtLimit) {
    const kept = outcome.kind === "rows" ? outcome.rows.length : 0;
    const reason =
      stoppedAtLimit === "rows"
        ? `Stopped after the first ${MAX_ROWS.toLocaleString("en-US")} rows.`
        : `Stopped after ${kept.toLocaleString("en-US")} ${kept === 1 ? "row" : "rows"} because the result reached the ${DATA_EXPLORER_MAX_RESULT_BYTES / (1024 * 1024)} MB limit.`;
    const later = stoppedBeforeBatch ? " Later GO batches did not run." : "";
    messages.push(`${reason} Statements after this query in the same batch may still have run.${later}`);
  }
  if (outcome.kind === "rows" && outcome.lossyColumns.length > 0) {
    messages.push(
      `Some values in ${outcome.lossyColumns.join(", ")} are too large to show exactly. Select CONVERT(varchar(64), <column>, 2) to see every digit.`
    );
  }
  return { outcome, messages };
};
