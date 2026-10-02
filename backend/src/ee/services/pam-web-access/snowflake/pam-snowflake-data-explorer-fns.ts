const skipQuoted = (sql: string, pos: number, quote: string): number => {
  // A backslash escapes inside a string literal, but not inside a quoted identifier
  const escapes = quote === "'";
  let i = pos + 1;
  while (i < sql.length) {
    if (escapes && sql[i] === "\\") {
      i += 2;
    } else if (sql[i] === quote) {
      if (i + 1 < sql.length && sql[i + 1] === quote) {
        i += 2;
      } else {
        return i + 1;
      }
    } else {
      i += 1;
    }
  }
  return sql.length;
};

// $$ ... $$ carries SQL verbatim, semicolons included
const skipDollarQuoted = (sql: string, pos: number): number => {
  const end = sql.indexOf("$$", pos + 2);
  return end === -1 ? sql.length : end + 2;
};

const isDollarQuote = (sql: string, pos: number) => sql[pos] === "$" && sql[pos + 1] === "$";

const isLineComment = (sql: string, pos: number) =>
  (sql[pos] === "-" && sql[pos + 1] === "-") || (sql[pos] === "/" && sql[pos + 1] === "/");

const isBlockComment = (sql: string, pos: number) => sql[pos] === "/" && sql[pos + 1] === "*";

const skipLineComment = (sql: string, pos: number): number => {
  let i = pos + 2;
  while (i < sql.length && sql[i] !== "\n") i += 1;
  return i;
};

const skipBlockComment = (sql: string, pos: number): number => {
  let i = pos + 2;
  while (i + 1 < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i += 1;
  return Math.min(i + 2, sql.length);
};

// MULTI_STATEMENT_COUNT would hide each statement's own result, so the session splits on ';' itself
export const splitSnowflakeStatements = (sql: string): string[] => {
  const statements: string[] = [];
  let pos = 0;
  let statementStart = 0;

  while (pos < sql.length) {
    const ch = sql[pos];

    if (ch === "'" || ch === '"') {
      pos = skipQuoted(sql, pos, ch);
    } else if (isDollarQuote(sql, pos)) {
      pos = skipDollarQuoted(sql, pos);
    } else if (isLineComment(sql, pos)) {
      pos = skipLineComment(sql, pos);
    } else if (isBlockComment(sql, pos)) {
      pos = skipBlockComment(sql, pos);
    } else if (ch === ";") {
      const statement = sql.slice(statementStart, pos).trim();
      if (statement.length > 0) statements.push(statement);
      pos += 1;
      statementStart = pos;
    } else {
      pos += 1;
    }
  }

  const tail = sql.slice(statementStart).trim();
  if (tail.length > 0) statements.push(tail);

  return statements;
};

export const extractCommand = (sql: string): string => {
  let pos = 0;

  while (pos < sql.length) {
    const ch = sql[pos];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      pos += 1;
    } else if (isLineComment(sql, pos)) {
      pos = skipLineComment(sql, pos);
    } else if (isBlockComment(sql, pos)) {
      pos = skipBlockComment(sql, pos);
    } else {
      break;
    }
  }

  const start = pos;
  while (pos < sql.length && !" \t\n\r;(".includes(sql[pos])) pos += 1;
  return sql.slice(start, pos).toUpperCase();
};

const TRANSACTION_OPENING_COMMANDS = new Set(["BEGIN", "START"]);
// Snowflake commits an open transaction implicitly before running any of these
const TRANSACTION_CLOSING_COMMANDS = new Set([
  "COMMIT",
  "ROLLBACK",
  "CREATE",
  "ALTER",
  "DROP",
  "TRUNCATE",
  "GRANT",
  "REVOKE"
]);

// Snowflake reports no transaction flag on a result, so it is tracked from the statements run
export const nextTransactionState = (command: string, current: boolean): boolean => {
  if (TRANSACTION_OPENING_COMMANDS.has(command)) return true;
  if (TRANSACTION_CLOSING_COMMANDS.has(command)) return false;
  return current;
};
