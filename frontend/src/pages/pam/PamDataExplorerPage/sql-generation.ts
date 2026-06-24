// Client-side SQL generation for the Data Explorer.
// All identifiers are properly quoted to prevent SQL injection.

export type SqlDialect = "postgres" | "mysql";

export function quoteIdent(name: string, dialect: SqlDialect = "postgres"): string {
  if (dialect === "mysql") return `\`${name.replace(/`/g, "``")}\``;
  return `"${name.replace(/"/g, '""')}"`;
}

export function quoteLiteral(value: unknown, dialect: SqlDialect = "postgres"): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "NULL";
    return String(value);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  const str = String(value);
  if (dialect === "postgres" && str.includes("'") && !str.includes("$")) {
    return `$$${str}$$`;
  }
  const escaped =
    dialect === "mysql" ? str.replace(/\\/g, "\\\\").replace(/'/g, "''") : str.replace(/'/g, "''");
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

function buildWhereClause(filters: FilterCondition[], dialect: SqlDialect): string {
  if (filters.length === 0) return "";
  const conditions = filters.map((f) => {
    const col = quoteIdent(f.column, dialect);
    switch (f.operator) {
      case "IS NULL":
        return `${col} IS NULL`;
      case "IS NOT NULL":
        return `${col} IS NOT NULL`;
      case "IN": {
        const values = f.value
          .split(",")
          .map((v) => quoteLiteral(v.trim(), dialect))
          .join(", ");
        return `${col} IN (${values})`;
      }
      case "ILIKE":
        if (dialect === "mysql") return `${col} LIKE ${quoteLiteral(f.value, dialect)}`;
        return `${col} ILIKE ${quoteLiteral(f.value, dialect)}`;
      case "LIKE":
        return `${col} LIKE ${quoteLiteral(f.value, dialect)}`;
      default:
        return `${col} ${f.operator} ${quoteLiteral(f.value, dialect)}`;
    }
  });
  return ` WHERE ${conditions.join(" AND ")}`;
}

function buildOrderByClause(sorts: SortCondition[], dialect: SqlDialect): string {
  if (sorts.length === 0) return "";
  const parts = sorts.map((s) => `${quoteIdent(s.column, dialect)} ${s.direction}`);
  return ` ORDER BY ${parts.join(", ")}`;
}

export function buildSelectQuery(params: {
  schema: string;
  table: string;
  filters: FilterCondition[];
  sorts: SortCondition[];
  limit: number;
  offset: number;
  primaryKeys?: string[];
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
    dialect = "postgres"
  } = params;
  const tableName = `${quoteIdent(schema, dialect)}.${quoteIdent(table, dialect)}`;
  const where = buildWhereClause(filters, dialect);

  let orderBy: string;
  if (sorts.length > 0) {
    orderBy = buildOrderByClause(sorts, dialect);
  } else if (primaryKeys && primaryKeys.length > 0) {
    orderBy = buildOrderByClause(
      primaryKeys.map((pk) => ({ column: pk, direction: "ASC" as const })),
      dialect
    );
  } else {
    orderBy = "";
  }

  return `SELECT * FROM ${tableName}${where}${orderBy} LIMIT ${limit} OFFSET ${offset}`;
}

export function buildCountQuery(params: {
  schema: string;
  table: string;
  filters: FilterCondition[];
  dialect?: SqlDialect;
}): string {
  const { schema, table, filters, dialect = "postgres" } = params;
  const tableName = `${quoteIdent(schema, dialect)}.${quoteIdent(table, dialect)}`;
  const where = buildWhereClause(filters, dialect);
  return `SELECT COUNT(*) AS count FROM ${tableName}${where}`;
}

export function buildInsertQuery(params: {
  schema: string;
  table: string;
  row: Record<string, unknown>;
  dialect?: SqlDialect;
}): string {
  const { schema, table, row, dialect = "postgres" } = params;
  const tableName = `${quoteIdent(schema, dialect)}.${quoteIdent(table, dialect)}`;
  const entries = Object.entries(row).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) {
    if (dialect === "mysql") return `INSERT INTO ${tableName} () VALUES ()`;
    return `INSERT INTO ${tableName} DEFAULT VALUES RETURNING *`;
  }
  const columns = entries.map(([k]) => quoteIdent(k, dialect)).join(", ");
  const values = entries.map(([, v]) => quoteLiteral(v, dialect)).join(", ");
  if (dialect === "mysql") return `INSERT INTO ${tableName} (${columns}) VALUES (${values})`;
  return `INSERT INTO ${tableName} (${columns}) VALUES (${values}) RETURNING *`;
}

export function buildUpdateQuery(params: {
  schema: string;
  table: string;
  changes: Record<string, unknown>;
  primaryKeyMatch: Record<string, unknown>;
  dialect?: SqlDialect;
}): string {
  const { schema, table, changes, primaryKeyMatch, dialect = "postgres" } = params;
  if (Object.keys(primaryKeyMatch).length === 0) {
    throw new Error("UPDATE requires at least one primary key condition");
  }
  const tableName = `${quoteIdent(schema, dialect)}.${quoteIdent(table, dialect)}`;
  const setClauses = Object.entries(changes)
    .map(([col, val]) => `${quoteIdent(col, dialect)} = ${quoteLiteral(val, dialect)}`)
    .join(", ");
  const whereClauses = Object.entries(primaryKeyMatch)
    .map(([col, val]) => `${quoteIdent(col, dialect)} = ${quoteLiteral(val, dialect)}`)
    .join(" AND ");
  if (dialect === "mysql") return `UPDATE ${tableName} SET ${setClauses} WHERE ${whereClauses}`;
  return `UPDATE ${tableName} SET ${setClauses} WHERE ${whereClauses} RETURNING *`;
}

export function buildDeleteQuery(params: {
  schema: string;
  table: string;
  primaryKeyMatch: Record<string, unknown>;
  dialect?: SqlDialect;
}): string {
  const { schema, table, primaryKeyMatch, dialect = "postgres" } = params;
  if (Object.keys(primaryKeyMatch).length === 0) {
    throw new Error("DELETE requires at least one primary key condition");
  }
  const tableName = `${quoteIdent(schema, dialect)}.${quoteIdent(table, dialect)}`;
  const whereClauses = Object.entries(primaryKeyMatch)
    .map(([col, val]) => `${quoteIdent(col, dialect)} = ${quoteLiteral(val, dialect)}`)
    .join(" AND ");
  return `DELETE FROM ${tableName} WHERE ${whereClauses}`;
}

// RETURNING * in individual INSERT/UPDATE is harmless but unused when wrapped here.
// The frontend re-fetches data after save anyway.
export function wrapInTransaction(statements: string[]): string {
  return `BEGIN;\n${statements.join(";\n")};\nCOMMIT;`;
}
