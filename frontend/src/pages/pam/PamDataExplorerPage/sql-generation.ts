// Client-side SQL generation for the Data Explorer.
// All identifiers are properly quoted to prevent SQL injection.

export type SqlDialect = "postgres" | "mysql" | "snowflake" | "clickhouse" | "mssql";

export function supportsRowEditing(dialect: SqlDialect): boolean {
  return dialect !== "clickhouse";
}

function assertRowEditingSupported(dialect: SqlDialect): void {
  if (supportsRowEditing(dialect)) return;
  throw new Error(
    "ClickHouse rows can't be edited from the grid. Use the SQL editor with ALTER TABLE ... UPDATE or DELETE FROM."
  );
}

function quoteIdent(name: string, dialect: SqlDialect = "postgres"): string {
  if (dialect === "mysql") return `\`${name.replace(/`/g, "``")}\``;
  if (dialect === "mssql") return `[${name.replaceAll("]", "]]")}]`;
  return `"${name.replace(/"/g, '""')}"`;
}

export type ColumnTypes = Record<string, string>;

const MSSQL_TEXT_TYPES = new Set([
  "char",
  "varchar",
  "nchar",
  "nvarchar",
  "text",
  "ntext",
  "xml",
  "sysname"
]);
const MSSQL_BINARY_TYPES = new Set(["binary", "varbinary", "image", "timestamp", "rowversion"]);
const MSSQL_NON_UNICODE_TYPES = new Set(["char", "varchar", "text"]);
const MSSQL_SOURCE_ALIAS = "[__src]";

function baseType(type: string): string {
  return type.split("(")[0].trim().toLowerCase();
}

function isHexLiteral(str: string): boolean {
  if (!str.startsWith("0x") && !str.startsWith("0X")) return false;
  return [...str.slice(2)].every((ch) => "0123456789abcdefABCDEF".includes(ch));
}

function quoteLiteral(
  value: unknown,
  dialect: SqlDialect = "postgres",
  columnType?: string
): string {
  if (dialect === "mssql" && columnType) {
    const type = baseType(columnType);
    // SQL Server silently converts '' to 0, 1900-01-01 or false for non-text columns
    if (value === "" && !MSSQL_TEXT_TYPES.has(type)) return "NULL";
    if (MSSQL_BINARY_TYPES.has(type) && typeof value === "string" && isHexLiteral(value)) {
      return value;
    }
    // An N'' literal makes SQL Server convert a varchar column for the comparison, which turns index seeks into scans
    if (MSSQL_NON_UNICODE_TYPES.has(type) && typeof value === "string") {
      return `'${value.replaceAll("'", "''")}'`;
    }
  }
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "NULL";
    return String(value);
  }
  if (typeof value === "boolean") {
    if (dialect === "mssql") return value ? "1" : "0";
    return value ? "TRUE" : "FALSE";
  }
  const str = String(value);
  if (dialect === "mssql") return `N'${str.replaceAll("'", "''")}'`;
  if (dialect === "postgres" && str.includes("'") && !str.includes("$")) {
    return `$$${str}$$`;
  }
  const escaped =
    dialect === "postgres"
      ? str.replace(/'/g, "''")
      : str.replace(/\\/g, "\\\\").replace(/'/g, "''");
  return `'${escaped}'`;
}

export type FilterCondition = {
  column: string;
  operator: FilterOperator;
  value: string;
};

export type FilterOperator =
  | "="
  | "<>"
  | ">"
  | "<"
  | ">="
  | "<="
  | "LIKE"
  | "ILIKE"
  | "IS NULL"
  | "IS NOT NULL"
  | "IN";

export type SortCondition = {
  column: string;
  direction: "ASC" | "DESC";
};

function buildWhereClause(
  filters: FilterCondition[],
  dialect: SqlDialect,
  columnTypes?: ColumnTypes
): string {
  if (filters.length === 0) return "";
  const conditions = filters.map((f) => {
    const col = quoteIdent(f.column, dialect);
    const type = columnTypes?.[f.column];
    switch (f.operator) {
      case "IS NULL":
        return `${col} IS NULL`;
      case "IS NOT NULL":
        return `${col} IS NOT NULL`;
      case "IN": {
        const values = f.value
          .split(",")
          .map((v) => quoteLiteral(v.trim(), dialect, type))
          .join(", ");
        return `${col} IN (${values})`;
      }
      case "ILIKE":
        if (dialect === "mysql" || dialect === "mssql")
          return `${col} LIKE ${quoteLiteral(f.value, dialect, type)}`;
        return `${col} ILIKE ${quoteLiteral(f.value, dialect, type)}`;
      case "LIKE":
        return `${col} LIKE ${quoteLiteral(f.value, dialect, type)}`;
      default:
        return `${col} ${f.operator} ${quoteLiteral(f.value, dialect, type)}`;
    }
  });
  return ` WHERE ${conditions.join(" AND ")}`;
}

function buildOrderByClause(sorts: SortCondition[], dialect: SqlDialect, qualifier = ""): string {
  if (sorts.length === 0) return "";
  const parts = sorts.map((s) => `${qualifier}${quoteIdent(s.column, dialect)} ${s.direction}`);
  return ` ORDER BY ${parts.join(", ")}`;
}

// The driver decodes decimal and money into floating point and drops datetimeoffset's offset, so the grid reads them as text
function buildMssqlSelectList(columns?: { name: string; type: string }[]): string {
  if (!columns || columns.length === 0) return "*";
  return columns
    .map((c) => {
      const id = quoteIdent(c.name, "mssql");
      const type = baseType(c.type);
      if (type === "money" || type === "smallmoney") {
        return `CONVERT(varchar(32), ${MSSQL_SOURCE_ALIAS}.${id}, 2) AS ${id}`;
      }
      if (type === "decimal" || type === "numeric") {
        return `CONVERT(varchar(64), ${MSSQL_SOURCE_ALIAS}.${id}) AS ${id}`;
      }
      if (type === "datetimeoffset") {
        return `CONVERT(varchar(34), ${MSSQL_SOURCE_ALIAS}.${id}, 121) AS ${id}`;
      }
      return `${MSSQL_SOURCE_ALIAS}.${id}`;
    })
    .join(", ");
}

export function buildSelectQuery(params: {
  schema: string;
  table: string;
  filters: FilterCondition[];
  sorts: SortCondition[];
  limit: number;
  offset: number;
  primaryKeys?: string[];
  columns?: { name: string; type: string }[];
  dialect?: SqlDialect;
}): string {
  const {
    schema,
    table,
    filters,
    sorts,
    limit,
    offset,
    primaryKeys,
    columns,
    dialect = "postgres"
  } = params;
  const tableName = `${quoteIdent(schema, dialect)}.${quoteIdent(table, dialect)}`;
  const columnTypes = columns
    ? Object.fromEntries(columns.map((c) => [c.name, c.type]))
    : undefined;
  const where = buildWhereClause(filters, dialect, columnTypes);
  // Qualified so a sort on a converted column uses the real column, not its varchar alias
  const qualifier = dialect === "mssql" ? `${MSSQL_SOURCE_ALIAS}.` : "";

  let orderBy: string;
  if (sorts.length > 0) {
    orderBy = buildOrderByClause(sorts, dialect, qualifier);
  } else if (primaryKeys && primaryKeys.length > 0) {
    orderBy = buildOrderByClause(
      primaryKeys.map((pk) => ({ column: pk, direction: "ASC" as const })),
      dialect,
      qualifier
    );
  } else {
    orderBy = "";
  }

  if (dialect === "mssql") {
    // OFFSET ... FETCH needs an ORDER BY
    const mssqlOrderBy = orderBy || " ORDER BY (SELECT NULL)";
    return `SELECT ${buildMssqlSelectList(columns)} FROM ${tableName} AS ${MSSQL_SOURCE_ALIAS}${where}${mssqlOrderBy} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
  }
  return `SELECT * FROM ${tableName}${where}${orderBy} LIMIT ${limit} OFFSET ${offset}`;
}

export function buildCountQuery(params: {
  schema: string;
  table: string;
  filters: FilterCondition[];
  columnTypes?: ColumnTypes;
  dialect?: SqlDialect;
}): string {
  const { schema, table, filters, columnTypes, dialect = "postgres" } = params;
  const tableName = `${quoteIdent(schema, dialect)}.${quoteIdent(table, dialect)}`;
  const where = buildWhereClause(filters, dialect, columnTypes);
  const countFn = dialect === "mssql" ? "COUNT_BIG(*)" : "COUNT(*)";
  return `SELECT ${countFn} AS ${quoteIdent("count", dialect)} FROM ${tableName}${where}`;
}

export function buildInsertQuery(params: {
  schema: string;
  table: string;
  row: Record<string, unknown>;
  columnTypes?: ColumnTypes;
  dialect?: SqlDialect;
}): string {
  const { schema, table, row, columnTypes, dialect = "postgres" } = params;
  assertRowEditingSupported(dialect);
  const tableName = `${quoteIdent(schema, dialect)}.${quoteIdent(table, dialect)}`;
  const entries = Object.entries(row).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) {
    if (dialect === "mysql") return `INSERT INTO ${tableName} () VALUES ()`;
    if (dialect === "mssql") return `INSERT INTO ${tableName} DEFAULT VALUES`;
    if (dialect === "snowflake") {
      throw new Error("Snowflake cannot insert a row with no values. Fill in at least one column.");
    }
    return `INSERT INTO ${tableName} DEFAULT VALUES RETURNING *`;
  }
  const columns = entries.map(([k]) => quoteIdent(k, dialect)).join(", ");
  const values = entries.map(([k, v]) => quoteLiteral(v, dialect, columnTypes?.[k])).join(", ");
  if (dialect !== "postgres") return `INSERT INTO ${tableName} (${columns}) VALUES (${values})`;
  return `INSERT INTO ${tableName} (${columns}) VALUES (${values}) RETURNING *`;
}

function buildPrimaryKeyMatch(
  primaryKeyMatch: Record<string, unknown>,
  dialect: SqlDialect,
  columnTypes?: ColumnTypes
): string {
  return Object.entries(primaryKeyMatch)
    .map(
      ([col, val]) =>
        `${quoteIdent(col, dialect)} = ${quoteLiteral(val, dialect, columnTypes?.[col])}`
    )
    .join(" AND ");
}

export function buildUpdateQuery(params: {
  schema: string;
  table: string;
  changes: Record<string, unknown>;
  primaryKeyMatch: Record<string, unknown>;
  columnTypes?: ColumnTypes;
  dialect?: SqlDialect;
}): string {
  const { schema, table, changes, primaryKeyMatch, columnTypes, dialect = "postgres" } = params;
  assertRowEditingSupported(dialect);
  if (Object.keys(primaryKeyMatch).length === 0) {
    throw new Error("UPDATE requires at least one primary key condition");
  }
  const tableName = `${quoteIdent(schema, dialect)}.${quoteIdent(table, dialect)}`;
  const setClauses = Object.entries(changes)
    .map(
      ([col, val]) =>
        `${quoteIdent(col, dialect)} = ${quoteLiteral(val, dialect, columnTypes?.[col])}`
    )
    .join(", ");
  const whereClauses = buildPrimaryKeyMatch(primaryKeyMatch, dialect, columnTypes);
  if (dialect !== "postgres") return `UPDATE ${tableName} SET ${setClauses} WHERE ${whereClauses}`;
  return `UPDATE ${tableName} SET ${setClauses} WHERE ${whereClauses} RETURNING *`;
}

export function buildDeleteQuery(params: {
  schema: string;
  table: string;
  primaryKeyMatch: Record<string, unknown>;
  columnTypes?: ColumnTypes;
  dialect?: SqlDialect;
}): string {
  const { schema, table, primaryKeyMatch, columnTypes, dialect = "postgres" } = params;
  assertRowEditingSupported(dialect);
  if (Object.keys(primaryKeyMatch).length === 0) {
    throw new Error("DELETE requires at least one primary key condition");
  }
  const tableName = `${quoteIdent(schema, dialect)}.${quoteIdent(table, dialect)}`;
  const whereClauses = buildPrimaryKeyMatch(primaryKeyMatch, dialect, columnTypes);
  return `DELETE FROM ${tableName} WHERE ${whereClauses}`;
}

// RETURNING * in individual INSERT/UPDATE is harmless but unused when wrapped here.
// The frontend re-fetches data after save anyway.
export function wrapInTransaction(statements: string[], dialect: SqlDialect = "postgres"): string {
  if (dialect === "mssql") {
    // Most T-SQL errors abort only the failing statement, so the batch would otherwise go on to COMMIT
    return `BEGIN TRY\nBEGIN TRANSACTION;\n${statements.join(";\n")};\nCOMMIT TRANSACTION;\nEND TRY\nBEGIN CATCH\nIF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;\nTHROW;\nEND CATCH`;
  }
  return `BEGIN;\n${statements.join(";\n")};\nCOMMIT;`;
}
