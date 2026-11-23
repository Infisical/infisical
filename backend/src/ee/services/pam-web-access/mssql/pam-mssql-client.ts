import { Connection, Request, TYPES } from "tedious";

import { type OneShotOptions } from "../pam-data-explorer-session-handler";

export const MSSQL_REQUEST_TIMEOUT_MS = 30_000;

// The gateway injects the account's credentials and answers PRELOGIN unencrypted, so no password or TLS here
export const connectMssql = ({ relayPort, username, database }: OneShotOptions, connectTimeout: number) =>
  new Promise<Connection>((resolve, reject) => {
    const conn = new Connection({
      server: "localhost",
      authentication: { type: "default", options: { userName: username, password: "" } },
      options: {
        port: relayPort,
        database: database || undefined,
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout,
        requestTimeout: MSSQL_REQUEST_TIMEOUT_MS,
        appName: "Infisical PAM"
      }
    });
    conn.connect((err) => {
      if (err) {
        conn.close();
        reject(err);
        return;
      }
      resolve(conn);
    });
  });

export const queryRows = <T extends Record<string, unknown>>(
  conn: Connection,
  sql: string,
  params: Record<string, string> = {}
) =>
  new Promise<T[]>((resolve, reject) => {
    const rows: T[] = [];
    const request = new Request(sql, (err) => {
      if (err) reject(err);
      else resolve(rows);
    });
    for (const [name, value] of Object.entries(params)) {
      request.addParameter(name, TYPES.NVarChar, value);
    }
    request.on("row", (columns: { value: unknown; metadata: { colName: string } }[]) => {
      const row: Record<string, unknown> = {};
      for (const col of columns) row[col.metadata.colName] = col.value;
      rows.push(row as T);
    });
    if (Object.keys(params).length > 0) conn.execSql(request);
    else conn.execSqlBatch(request);
  });

type TMssqlError = { message?: string; code?: string; number?: number; state?: number; class?: number };

// tedious wraps a batch's errors in an AggregateError (empty message) when the server raises more than one
export const extractMssqlErrorFields = (err: unknown) => {
  const errors = (err instanceof AggregateError ? err.errors : [err]) as TMssqlError[];
  const message = errors
    .map((e) => e?.message)
    .filter(Boolean)
    .join("\n");
  const first = errors.find((e) => e?.number !== undefined) ?? errors[0];
  const detail =
    first?.number !== undefined
      ? `Msg ${first.number}, Level ${first.class ?? 0}, State ${first.state ?? 0}`
      : (first?.code ?? undefined);
  return { message: message || undefined, detail };
};
