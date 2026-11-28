const isWhitespace = (ch: string) => ch === " " || ch === "\t" || ch === "\n" || ch === "\r";

const skipQuoted = (sql: string, pos: number, close: string): number => {
  let i = pos + 1;
  while (i < sql.length) {
    if (sql[i] === close) {
      if (sql[i + 1] === close) {
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

const skipLineComment = (sql: string, pos: number): number => {
  let i = pos + 2;
  while (i < sql.length && sql[i] !== "\n") i += 1;
  return i;
};

// T-SQL block comments nest
const skipBlockComment = (sql: string, pos: number): number => {
  let depth = 0;
  let i = pos;
  while (i < sql.length) {
    if (sql[i] === "/" && sql[i + 1] === "*") {
      depth += 1;
      i += 2;
    } else if (sql[i] === "*" && sql[i + 1] === "/") {
      depth -= 1;
      i += 2;
      if (depth === 0) return i;
    } else {
      i += 1;
    }
  }
  return sql.length;
};

const isLineComment = (sql: string, pos: number) => sql[pos] === "-" && sql[pos + 1] === "-";
const isBlockComment = (sql: string, pos: number) => sql[pos] === "/" && sql[pos + 1] === "*";

export const MAX_GO_REPEAT = 100;

const isDigits = (s: string) => s.length > 0 && [...s].every((ch) => ch >= "0" && ch <= "9");

const parseGoLine = (line: string): number | null => {
  const trimmed = line.trim();
  if (trimmed.slice(0, 2).toUpperCase() !== "GO") return null;
  let rest = trimmed.slice(2);
  if (rest.length > 0 && !isWhitespace(rest[0]) && rest[0] !== ";" && !rest.startsWith("--")) return null;
  const commentAt = rest.indexOf("--");
  if (commentAt !== -1) rest = rest.slice(0, commentAt);
  rest = rest.trim();
  if (rest.startsWith(";")) rest = rest.slice(1).trim();
  if (rest === "") return 1;
  if (!isDigits(rest)) return null;
  const count = Number(rest);
  if (count < 1 || count > MAX_GO_REPEAT) {
    throw new Error(`GO repeat count must be between 1 and ${MAX_GO_REPEAT}, got ${rest}`);
  }
  return count;
};

// GO is a client-side separator (SSMS, sqlcmd) the server rejects; it only counts on its own line, outside strings
export const splitMssqlBatches = (sql: string): string[] => {
  const batches: string[] = [];
  let batchStart = 0;
  let pos = 0;

  const lineEnd = (from: number) => {
    const nl = sql.indexOf("\n", from);
    return nl === -1 ? sql.length : nl;
  };

  const tryGoAt = (lineStart: number): boolean => {
    const end = lineEnd(lineStart);
    const count = parseGoLine(sql.slice(lineStart, end));
    if (count === null) return false;
    const batch = sql.slice(batchStart, lineStart).trim();
    if (batch.length > 0) {
      for (let i = 0; i < count; i += 1) batches.push(batch);
    }
    batchStart = Math.min(end + 1, sql.length);
    pos = batchStart;
    return true;
  };

  const consumeGoLines = () => {
    let consumed = pos < sql.length && tryGoAt(pos);
    while (consumed) consumed = pos < sql.length && tryGoAt(pos);
  };

  consumeGoLines();
  while (pos < sql.length) {
    const ch = sql[pos];
    if (ch === "'" || ch === '"') {
      pos = skipQuoted(sql, pos, ch);
    } else if (ch === "[") {
      pos = skipQuoted(sql, pos, "]");
    } else if (isLineComment(sql, pos)) {
      pos = skipLineComment(sql, pos);
    } else if (isBlockComment(sql, pos)) {
      pos = skipBlockComment(sql, pos);
    } else if (ch === "\n") {
      pos += 1;
      consumeGoLines();
    } else {
      pos += 1;
    }
  }

  const tail = sql.slice(batchStart).trim();
  if (tail.length > 0) batches.push(tail);

  return batches;
};

export const splitMssqlStatements = (sql: string): string[] => {
  const stmts: string[] = [];
  let pos = 0;
  let stmtStart = 0;

  while (pos < sql.length) {
    const ch = sql[pos];

    if (ch === "'" || ch === '"') {
      pos = skipQuoted(sql, pos, ch);
    } else if (ch === "[") {
      pos = skipQuoted(sql, pos, "]");
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

const leadingWords = (sql: string, count: number): string[] => {
  const words: string[] = [];
  let pos = 0;
  const len = sql.length;
  while (pos < len && words.length < count) {
    if (isWhitespace(sql[pos])) {
      pos += 1;
    } else if (isLineComment(sql, pos)) {
      pos = skipLineComment(sql, pos);
    } else if (isBlockComment(sql, pos)) {
      pos = skipBlockComment(sql, pos);
    } else {
      const start = pos;
      while (pos < len && !isWhitespace(sql[pos]) && sql[pos] !== "(" && sql[pos] !== ";") pos += 1;
      if (pos === start) break;
      words.push(sql.slice(start, pos).toUpperCase());
    }
  }
  return words;
};

const TRANSACTION_KEYWORDS = new Set(["TRAN", "TRANSACTION", "DISTRIBUTED"]);
const BLOCK_END_KEYWORDS = new Set(["TRY", "CATCH"]);
const ROW_COUNT_VERBS = new Set(["INSERT", "UPDATE", "DELETE"]);

// BEGIN and END also open and close TRY, CATCH and statement blocks, which must not read as a command
export const extractCommand = (sql: string): string => {
  const [first = "", second = ""] = leadingWords(sql, 2);
  if (first === "BEGIN" && !TRANSACTION_KEYWORDS.has(second)) return "";
  if (first === "END" && (second === "" || BLOCK_END_KEYWORDS.has(second))) return "";
  return first;
};

export const extractLastCommand = (sql: string): string => {
  const stmts = splitMssqlBatches(sql).flatMap(splitMssqlStatements);
  const last = stmts[stmts.length - 1];
  return last ? extractCommand(last) : "";
};

// T-SQL statements need no semicolons and IF/EXEC/WITH can wrap any verb, so only a lone plain verb is named
export const extractSingleStatementCommand = (sql: string): string => {
  const stmts = splitMssqlBatches(sql).flatMap(splitMssqlStatements);
  if (stmts.length !== 1) return "";
  const command = extractCommand(stmts[0]);
  return ROW_COUNT_VERBS.has(command) ? command : "";
};

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

const formatDate = (d: Date) => `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// tedious keeps sub-millisecond precision in a non-enumerable nanosecondsDelta on the Date
const formatFraction = (d: Date, scale: number) => {
  if (scale <= 0) return "";
  const delta = (d as Date & { nanosecondsDelta?: number }).nanosecondsDelta ?? 0;
  const ticks = d.getUTCMilliseconds() * 10_000 + Math.round(delta * 1e7);
  return `.${String(ticks).padStart(7, "0").slice(0, scale)}`;
};

const formatTime = (d: Date, scale: number) =>
  `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}${formatFraction(d, scale)}`;

// tedious names nullable datetime and smalldatetime both DateTimeN; only the 4-byte length tells them apart
export const resolveMssqlTypeName = (typeName: string, dataLength?: number): string =>
  typeName === "DateTimeN" && dataLength === 4 ? "SmallDateTime" : typeName;

const DECIMAL_TYPES = new Set(["Decimal", "Numeric", "DecimalN", "NumericN"]);
const MONEY_TYPES = new Set(["Money", "MoneyN", "SmallMoney"]);

const decimalScale = (typeName: string, scale?: number): number | null => {
  if (MONEY_TYPES.has(typeName)) return 4;
  if (DECIMAL_TYPES.has(typeName)) return scale ?? 0;
  return null;
};

// tedious divides the stored integer by 10^scale into a double, which can round the last digit once it passes 2^52
export const isLossyDecimal = (value: unknown, typeName: string, scale?: number): boolean => {
  const digits = decimalScale(typeName, scale);
  return digits !== null && typeof value === "number" && Math.abs(value) * 10 ** digits > 2 ** 52;
};

// Rendered losslessly in SQL Server's literal format because the grid sends these values back as row keys
export const formatMssqlValue = (value: unknown, typeName: string, scale?: number): unknown => {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    const digits = decimalScale(typeName, scale);
    return digits === null ? value : value.toFixed(digits);
  }
  if (Buffer.isBuffer(value)) return `0x${value.toString("hex").toUpperCase()}`;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    switch (typeName) {
      case "Date":
        return formatDate(value);
      case "Time":
        return formatTime(value, scale ?? 7);
      case "DateTime2":
        return `${formatDate(value)} ${formatTime(value, scale ?? 7)}`;
      case "DateTimeOffset":
        return `${formatDate(value)} ${formatTime(value, scale ?? 7)} +00:00`;
      case "SmallDateTime":
        return `${formatDate(value)} ${formatTime(value, 0)}`;
      default:
        return `${formatDate(value)} ${formatTime(value, 3)}`;
    }
  }
  return value;
};

// SQL Server allows unnamed and duplicate result columns, but rows are keyed by name
export const uniqueColumnNames = (names: string[]): string[] => {
  const used = new Set<string>();
  const nextSuffix = new Map<string, number>();
  return names.map((raw) => {
    const base = raw || "(No column name)";
    let name = base;
    let n = nextSuffix.get(base) ?? 2;
    while (used.has(name)) {
      name = `${base} (${n})`;
      n += 1;
    }
    nextSuffix.set(base, n);
    used.add(name);
    return name;
  });
};
