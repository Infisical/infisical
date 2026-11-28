import net from "node:net";

import { Connection, Request, TYPES } from "tedious";

import { type OneShotOptions } from "../pam-data-explorer-session-handler";
import { DATA_EXPLORER_MAX_RESULT_BYTES } from "../pam-web-access-fns";

export const MSSQL_REQUEST_TIMEOUT_MS = 30_000;

export const MSSQL_REROUTE_MESSAGE =
  "SQL Server tried to redirect this connection to another server, which browser access doesn't support";

const RELAY_HOST = "127.0.0.1";

// A larger value is cut off by the server rather than read whole, and still exceeds the result limit
const MSSQL_TEXTSIZE = DATA_EXPLORER_MAX_RESULT_BYTES * 2 + 2;

// tedious follows a server's ROUTING redirect to any host, so only the local relay port may be dialed
export const localOnlyMssqlConnector =
  (relayPort: number, onRedirect?: () => void) => (target?: { host?: string; port?: number }) =>
    new Promise<net.Socket>((resolve, reject) => {
      if (target && (target.host !== RELAY_HOST || target.port !== relayPort)) {
        onRedirect?.();
        reject(new Error(MSSQL_REROUTE_MESSAGE));
        return;
      }
      const socket = net.connect({ host: RELAY_HOST, port: relayPort });
      socket.once("connect", () => {
        socket.off("error", reject);
        resolve(socket);
      });
      socket.once("error", reject);
    });

// The gateway injects the account's credentials and answers PRELOGIN unencrypted, so no password or TLS here
export const connectMssql = ({ relayPort, username, database }: OneShotOptions, connectTimeout: number) =>
  new Promise<Connection>((resolve, reject) => {
    const conn = new Connection({
      server: RELAY_HOST,
      authentication: { type: "default", options: { userName: username, password: "" } },
      options: {
        port: relayPort,
        connector: localOnlyMssqlConnector(relayPort),
        textsize: MSSQL_TEXTSIZE,
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
