const skipQuoted = (sql: string, pos: number, quote: string): number => {
  let i = pos + 1;
  while (i < sql.length && sql[i] !== quote) {
    i += sql[i] === "\\" ? 2 : 1;
  }
  return i + 1;
};

const skipLineComment = (sql: string, pos: number): number => {
  let i = pos + 2;
  while (i < sql.length && sql[i] !== "\n") i += 1;
  return i;
};

const skipBlockComment = (sql: string, pos: number): number => {
  let i = pos + 2;
  while (i + 1 < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i += 1;
  return i + 2;
};

const isLineComment = (sql: string, pos: number) => sql[pos] === "-" && sql[pos + 1] === "-";

const isBlockComment = (sql: string, pos: number) => sql[pos] === "/" && sql[pos + 1] === "*";

// mysql2 can't run multiple statements per query() call, so we split on ';' ourselves, skipping strings/comments.
export const splitMysqlStatements = (sql: string): string[] => {
  const stmts: string[] = [];
  let pos = 0;
  let stmtStart = 0;

  while (pos < sql.length) {
    const ch = sql[pos];

    if (ch === "'" || ch === '"' || ch === "`") {
      pos = skipQuoted(sql, pos, ch);
    } else if (isLineComment(sql, pos)) {
      pos = skipLineComment(sql, pos);
    } else if (isBlockComment(sql, pos)) {
      pos = skipBlockComment(sql, pos);
    } else if (ch === ";") {
      const stmt = sql.slice(stmtStart, pos).trim();
      if (stmt.length > 0) stmts.push(stmt);
      pos += 1;
      stmtStart = pos;
    } else {
      pos += 1;
    }
  }

  const tail = sql.slice(stmtStart).trim();
  if (tail.length > 0) stmts.push(tail);

  return stmts;
};

export const extractCommand = (sql: string): string => {
  const trimmed = sql.trimStart();
  let i = 0;
  while (i < trimmed.length && trimmed[i] !== " " && trimmed[i] !== "\t" && trimmed[i] !== "\n" && trimmed[i] !== "\r") {
    i += 1;
  }
  return trimmed.slice(0, i).toUpperCase();
};
