export type SqlDialect = "postgres" | "mysql" | "snowflake" | "clickhouse";

export const supportsRowEditing = (dialect: SqlDialect) => dialect !== "clickhouse";

const assertRowEditingSupported = (dialect: SqlDialect) => {
  if (supportsRowEditing(dialect)) return;
  throw new Error(
    "ClickHouse rows can't be edited from the grid. Use the SQL editor with ALTER TABLE ... UPDATE or DELETE FROM."
  );
};

const quoteIdent = (name: string, dialect: SqlDialect) =>
  dialect === "mysql" ? `\`${name.replace(/`/g, "``")}\`` : `"${name.replace(/"/g, '""')}"`;

const quoteLiteral = (value: unknown, dialect: SqlDialect): string => {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  const text = String(value);
  if (dialect === "postgres" && text.includes("'") && !text.includes("$")) return `$$${text}$$`;
  const escaped =
    dialect === "postgres"
      ? text.replace(/'/g, "''")
      : text.replace(/\\/g, "\\\\").replace(/'/g, "''");
  return `'${escaped}'`;
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

export type FilterCondition = { column: string; operator: FilterOperator; value: string };

export type SortCondition = { column: string; direction: "ASC" | "DESC" };

const tableName = (schema: string, table: string, dialect: SqlDialect) =>
  `${quoteIdent(schema, dialect)}.${quoteIdent(table, dialect)}`;

const whereClause = (filters: FilterCondition[], dialect: SqlDialect) => {
  if (filters.length === 0) return "";
  const conditions = filters.map(({ column, operator, value }) => {
    const target = quoteIdent(column, dialect);
    if (operator === "IS NULL" || operator === "IS NOT NULL") return `${target} ${operator}`;
    if (operator === "IN")
      return `${target} IN (${value
        .split(",")
        .map((item) => quoteLiteral(item.trim(), dialect))
        .join(", ")})`;
    if (operator === "ILIKE" && dialect === "mysql")
      return `${target} LIKE ${quoteLiteral(value, dialect)}`;
    return `${target} ${operator} ${quoteLiteral(value, dialect)}`;
  });
  return ` WHERE ${conditions.join(" AND ")}`;
};

const orderByClause = (sorts: SortCondition[], dialect: SqlDialect) =>
  sorts.length === 0
    ? ""
    : ` ORDER BY ${sorts.map((sort) => `${quoteIdent(sort.column, dialect)} ${sort.direction}`).join(", ")}`;

const matchClause = (match: Record<string, unknown>, dialect: SqlDialect) =>
  Object.entries(match)
    .map(([column, value]) => `${quoteIdent(column, dialect)} = ${quoteLiteral(value, dialect)}`)
    .join(" AND ");

export const buildSelectQuery = ({
  schema,
  table,
  filters,
  sorts,
  limit,
  offset,
  primaryKeys,
  dialect
}: {
  schema: string;
  table: string;
  filters: FilterCondition[];
  sorts: SortCondition[];
  limit: number;
  offset: number;
  primaryKeys: string[];
  dialect: SqlDialect;
}) => {
  const order =
    sorts.length > 0 ? sorts : primaryKeys.map((column) => ({ column, direction: "ASC" as const }));
  return `SELECT * FROM ${tableName(schema, table, dialect)}${whereClause(filters, dialect)}${orderByClause(order, dialect)} LIMIT ${limit} OFFSET ${offset}`;
};

export const buildCountQuery = ({
  schema,
  table,
  filters,
  dialect
}: {
  schema: string;
  table: string;
  filters: FilterCondition[];
  dialect: SqlDialect;
}) =>
  `SELECT COUNT(*) AS ${quoteIdent("count", dialect)} FROM ${tableName(schema, table, dialect)}${whereClause(filters, dialect)}`;

export const buildInsertQuery = ({
  schema,
  table,
  row,
  dialect
}: {
  schema: string;
  table: string;
  row: Record<string, unknown>;
  dialect: SqlDialect;
}) => {
  assertRowEditingSupported(dialect);
  const target = tableName(schema, table, dialect);
  const entries = Object.entries(row).filter(([, value]) => value !== undefined && value !== "");
  if (entries.length === 0) {
    if (dialect === "mysql") return `INSERT INTO ${target} () VALUES ()`;
    if (dialect === "snowflake")
      throw new Error("Snowflake cannot insert a row with no values. Fill in at least one column.");
    return `INSERT INTO ${target} DEFAULT VALUES RETURNING *`;
  }
  const columns = entries.map(([column]) => quoteIdent(column, dialect)).join(", ");
  const values = entries.map(([, value]) => quoteLiteral(value, dialect)).join(", ");
  const insert = `INSERT INTO ${target} (${columns}) VALUES (${values})`;
  return dialect === "postgres" ? `${insert} RETURNING *` : insert;
};

export const buildUpdateQuery = ({
  schema,
  table,
  changes,
  primaryKeyMatch,
  dialect
}: {
  schema: string;
  table: string;
  changes: Record<string, unknown>;
  primaryKeyMatch: Record<string, unknown>;
  dialect: SqlDialect;
}) => {
  assertRowEditingSupported(dialect);
  if (Object.keys(primaryKeyMatch).length === 0)
    throw new Error("UPDATE requires at least one primary key condition");
  const sets = Object.entries(changes)
    .map(([column, value]) => `${quoteIdent(column, dialect)} = ${quoteLiteral(value, dialect)}`)
    .join(", ");
  const update = `UPDATE ${tableName(schema, table, dialect)} SET ${sets} WHERE ${matchClause(primaryKeyMatch, dialect)}`;
  return dialect === "postgres" ? `${update} RETURNING *` : update;
};

export const buildDeleteQuery = ({
  schema,
  table,
  primaryKeyMatch,
  dialect
}: {
  schema: string;
  table: string;
  primaryKeyMatch: Record<string, unknown>;
  dialect: SqlDialect;
}) => {
  assertRowEditingSupported(dialect);
  if (Object.keys(primaryKeyMatch).length === 0)
    throw new Error("DELETE requires at least one primary key condition");
  return `DELETE FROM ${tableName(schema, table, dialect)} WHERE ${matchClause(primaryKeyMatch, dialect)}`;
};

export const wrapInTransaction = (statements: string[]) =>
  `BEGIN;\n${statements.join(";\n")};\nCOMMIT;`;
