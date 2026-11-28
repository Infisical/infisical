import net from "node:net";

import { parse as parseSql } from "libpg-query";
import RE2 from "re2";

const CANCEL_REQUEST_CODE = 80877102;

// The protocol-level cancel psql sends, since CockroachDB has no pg_cancel_backend()
export const sendCancelRequest = (port: number, processId: number, secretKey: number) =>
  new Promise<void>((resolve, reject) => {
    const packet = Buffer.alloc(16);
    packet.writeInt32BE(16, 0);
    packet.writeInt32BE(CANCEL_REQUEST_CODE, 4);
    packet.writeInt32BE(processId, 8);
    packet.writeInt32BE(secretKey, 12);
    const socket = net.connect({ host: "localhost", port }, () => socket.end(packet));
    socket.setTimeout(5_000, () => socket.destroy(new Error("Timed out sending the cancel request")));
    socket.once("error", reject);
    socket.once("close", () => resolve());
  });

const DOLLAR_QUOTE_OPENER = new RE2(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
const IDENTIFIER_CHAR = new RE2(/^[A-Za-z0-9_$]$/);

const isIdentifierChar = (ch: string | undefined) => ch !== undefined && IDENTIFIER_CHAR.test(ch);

const isWhitespace = (ch: string) => ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f";

const skipQuoted = (sql: string, pos: number, quote: string, backslashEscapes: boolean): number => {
  let i = pos + 1;
  while (i < sql.length) {
    if (backslashEscapes && sql[i] === "\\") i += 2;
    else if (sql[i] !== quote) i += 1;
    else if (sql[i + 1] === quote) i += 2;
    else return i + 1;
  }
  return sql.length;
};

// Block comments nest in PostgreSQL and CockroachDB
const skipBlockComment = (sql: string, pos: number): number => {
  let depth = 0;
  let i = pos;
  while (i < sql.length) {
    if (sql.startsWith("/*", i)) {
      depth += 1;
      i += 2;
    } else if (sql.startsWith("*/", i)) {
      depth -= 1;
      i += 2;
      if (depth === 0) return i;
    } else {
      i += 1;
    }
  }
  return sql.length;
};

const skipToken = (sql: string, pos: number): number => {
  const ch = sql[pos];
  if (ch === "'") {
    // E'' strings and CockroachDB's b'' byte strings take backslash escapes
    const isEscapeString = "eEbB".includes(sql[pos - 1] ?? " ") && !isIdentifierChar(sql[pos - 2]);
    return skipQuoted(sql, pos, "'", isEscapeString);
  }
  if (ch === '"') return skipQuoted(sql, pos, '"', false);
  if (ch === "$" && !isIdentifierChar(sql[pos - 1])) {
    const tag = DOLLAR_QUOTE_OPENER.exec(sql.slice(pos, pos + 65))?.[0];
    if (tag) {
      const end = sql.indexOf(tag, pos + tag.length);
      return end === -1 ? sql.length : end + tag.length;
    }
  }
  return pos + 1;
};

const splitStatementsLexically = (sql: string): string[] => {
  const statements: string[] = [];
  let start = 0;
  let hasCode = false;
  let pos = 0;
  while (pos <= sql.length) {
    if (pos === sql.length || sql[pos] === ";") {
      if (hasCode) statements.push(sql.slice(start, pos).trim());
      start = pos + 1;
      hasCode = false;
      pos += 1;
    } else if (sql.startsWith("--", pos)) {
      const end = sql.indexOf("\n", pos);
      pos = end === -1 ? sql.length : end;
    } else if (sql.startsWith("/*", pos)) {
      pos = skipBlockComment(sql, pos);
    } else {
      hasCode ||= !isWhitespace(sql[pos]);
      pos = skipToken(sql, pos);
    }
  }
  return statements;
};

// libpg-query only parses PostgreSQL's grammar, so CockroachDB-only syntax (UPSERT, say) is split lexically, and a
// multi-statement CockroachDB script runs only once CockroachDB has parsed all of it into the same statements
export const splitPostgresStatements = async (
  sql: string,
  { countStatementsOnServer }: { countStatementsOnServer?: (script: string) => Promise<number> } = {}
): Promise<string[]> => {
  let statements: string[];
  try {
    const { stmts } = (await parseSql(sql)) as { stmts: { stmt_location?: number; stmt_len?: number }[] };
    // libpg-query reports UTF-8 byte offsets, not string indexes
    const bytes = Buffer.from(sql);
    statements = stmts.map(({ stmt_location: location = 0, stmt_len: length }) =>
      bytes
        .subarray(location, length === undefined ? undefined : location + length)
        .toString()
        .trim()
    );
  } catch (err) {
    if (!countStatementsOnServer) throw err;
    statements = splitStatementsLexically(sql);
  }
  if (countStatementsOnServer && statements.length > 1 && (await countStatementsOnServer(sql)) !== statements.length) {
    throw new Error("Infisical couldn't split this script into statements. Run its statements one at a time.");
  }
  return statements;
};
