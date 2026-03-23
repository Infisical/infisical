// Client-side SQL generation for the Postgres Data Explorer.
// All identifiers are properly quoted to prevent SQL injection.

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function quoteLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "NULL";
    return String(value);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  const str = String(value);
  // Use dollar-quoting if the string contains single quotes and no dollar signs
  if (str.includes("'") && !str.includes("$")) {
    return `$$${str}$$`;
  }
  return `'${str.replace(/'/g, "''")}'`;
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

function buildWhereClause(filters: FilterCondition[]): string {
  if (filters.length === 0) return "";
  const conditions = filters.map((f) => {
    const col = quoteIdent(f.column);
    switch (f.operator) {
      case "IS NULL":
        return `${col} IS NULL`;
      case "IS NOT NULL":
        return `${col} IS NOT NULL`;
      case "IN": {
        const values = f.value
          .split(",")
          .map((v) => quoteLiteral(v.trim()))
          .join(", ");
        return `${col} IN (${values})`;
      }
      case "LIKE":
      case "ILIKE":
        return `${col} ${f.operator} ${quoteLiteral(f.value)}`;
      default:
        return `${col} ${f.operator} ${quoteLiteral(f.value)}`;
    }
  });
  return ` WHERE ${conditions.join(" AND ")}`;
}

function buildOrderByClause(sorts: SortCondition[]): string {
  if (sorts.length === 0) return "";
  const parts = sorts.map((s) => `${quoteIdent(s.column)} ${s.direction}`);
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
}): string {
  const { schema, table, filters, sorts, limit, offset, primaryKeys } = params;
  const tableName = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const where = buildWhereClause(filters);

  // Default sort by PK for stable pagination
  let orderBy: string;
  if (sorts.length > 0) {
    orderBy = buildOrderByClause(sorts);
  } else if (primaryKeys && primaryKeys.length > 0) {
    orderBy = buildOrderByClause(
      primaryKeys.map((pk) => ({ column: pk, direction: "ASC" as const }))
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
}): string {
  const { schema, table, filters } = params;
  const tableName = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const where = buildWhereClause(filters);
  return `SELECT COUNT(*) AS count FROM ${tableName}${where}`;
}

export function buildInsertQuery(params: {
  schema: string;
  table: string;
  row: Record<string, unknown>;
}): string {
  const { schema, table, row } = params;
  const tableName = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const entries = Object.entries(row).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) {
    return `INSERT INTO ${tableName} DEFAULT VALUES RETURNING *`;
  }
  const columns = entries.map(([k]) => quoteIdent(k)).join(", ");
  const values = entries.map(([, v]) => quoteLiteral(v)).join(", ");
  return `INSERT INTO ${tableName} (${columns}) VALUES (${values}) RETURNING *`;
}

export function buildUpdateQuery(params: {
  schema: string;
  table: string;
  changes: Record<string, unknown>;
  primaryKeyMatch: Record<string, unknown>;
}): string {
  const { schema, table, changes, primaryKeyMatch } = params;
  const tableName = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const setClauses = Object.entries(changes)
    .map(([col, val]) => `${quoteIdent(col)} = ${quoteLiteral(val)}`)
    .join(", ");
  const whereClauses = Object.entries(primaryKeyMatch)
    .map(([col, val]) => `${quoteIdent(col)} = ${quoteLiteral(val)}`)
    .join(" AND ");
  return `UPDATE ${tableName} SET ${setClauses} WHERE ${whereClauses} RETURNING *`;
}

export function buildDeleteQuery(params: {
  schema: string;
  table: string;
  primaryKeyMatch: Record<string, unknown>;
}): string {
  const { schema, table, primaryKeyMatch } = params;
  const tableName = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const whereClauses = Object.entries(primaryKeyMatch)
    .map(([col, val]) => `${quoteIdent(col)} = ${quoteLiteral(val)}`)
    .join(" AND ");
  return `DELETE FROM ${tableName} WHERE ${whereClauses}`;
}

// Note: RETURNING * in individual INSERT/UPDATE statements is harmless but unused when
// wrapped here — pgClient.query() returns only the last statement's result (COMMIT).
// The frontend re-fetches data after save anyway.
export function wrapInTransaction(statements: string[]): string {
  return `BEGIN;\n${statements.join(";\n")};\nCOMMIT;`;
}
