const skipQuoted = (sql: string, pos: number, quote: string): number => {
  // ClickHouse escapes with a backslash inside every quoted form, and also accepts the quote doubled
  let i = pos + 1;
  while (i < sql.length) {
    if (sql[i] === "\\") {
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

const isLineComment = (sql: string, pos: number) => (sql[pos] === "-" && sql[pos + 1] === "-") || sql[pos] === "#";

const isBlockComment = (sql: string, pos: number) => sql[pos] === "/" && sql[pos + 1] === "*";

const skipLineComment = (sql: string, pos: number): number => {
  let i = pos + 1;
  while (i < sql.length && sql[i] !== "\n") i += 1;
  return i;
};

const skipBlockComment = (sql: string, pos: number): number => {
  let i = pos + 2;
  while (i + 1 < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i += 1;
  return Math.min(i + 2, sql.length);
};

// The HTTP interface runs one statement per request, so an editor tab's script is split here
export const splitClickhouseStatements = (sql: string): string[] => {
  const statements: string[] = [];
  let pos = 0;
  let statementStart = 0;

  while (pos < sql.length) {
    const ch = sql[pos];

    if (ch === "'" || ch === '"' || ch === "`") {
      pos = skipQuoted(sql, pos, ch);
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

export const uniqueFieldNames = (names: string[]): string[] => {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}_${count}`;
  });
};

export const toRowObjects = (fieldNames: string[], data: unknown[][]): Record<string, unknown>[] =>
  data.map((values) => Object.fromEntries(fieldNames.map((name, index) => [name, values[index] ?? null])));

// The explorer renders at most this many rows
export const MAX_ROWS = 1000;

export type TStatementResult = {
  rows: Record<string, unknown>[];
  fields: { name: string }[];
  rowCount: number | null;
  isTruncated: boolean;
};

const writtenRows = (summary?: { written_rows: string }): number | null => {
  const value = Number(summary?.written_rows);
  return Number.isFinite(value) ? value : null;
};

export const parseStatementBody = (body: string, summary?: { written_rows: string }): TStatementResult => {
  if (body.trim().length === 0) {
    return { rows: [], fields: [], rowCount: writtenRows(summary), isTruncated: false };
  }

  let parsed: { meta?: { name: string }[]; data?: unknown[] } | null = null;
  try {
    parsed = JSON.parse(body) as { meta?: { name: string }[]; data?: unknown[] };
  } catch {
    parsed = null;
  }

  if (!parsed || !Array.isArray(parsed.meta) || !Array.isArray(parsed.data)) {
    return {
      rows: [{ result: body }],
      fields: [{ name: "result" }],
      rowCount: null,
      isTruncated: false
    };
  }

  const fieldNames = uniqueFieldNames(parsed.meta.map((column) => column.name));
  const isTruncated = parsed.data.length > MAX_ROWS;
  const data = isTruncated ? parsed.data.slice(0, MAX_ROWS) : parsed.data;

  const rows =
    data.length > 0 && !Array.isArray(data[0])
      ? (data as Record<string, unknown>[])
      : toRowObjects(fieldNames, data as unknown[][]);

  return {
    rows,
    fields: fieldNames.map((name) => ({ name })),
    rowCount: parsed.data.length,
    isTruncated
  };
};
