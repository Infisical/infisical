import { quoteSnowflakeIdent } from "@app/services/app-connection/snowflake";

// Unqualified, so it resolves against the database the session already opened
export const SCHEMAS_QUERY = `SELECT SCHEMA_NAME AS "name"
  FROM INFORMATION_SCHEMA.SCHEMATA
  WHERE SCHEMA_NAME <> 'INFORMATION_SCHEMA'
  ORDER BY SCHEMA_NAME`;

export const TABLES_QUERY = `SELECT TABLE_NAME AS "name", TABLE_TYPE AS "tableType"
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = ?
  ORDER BY TABLE_NAME`;

export const COLUMNS_QUERY = `SELECT
    COLUMN_NAME AS "name",
    DATA_TYPE AS "type",
    IS_NULLABLE AS "isNullable",
    IDENTITY_GENERATION AS "identityGeneration"
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
  ORDER BY ORDINAL_POSITION`;

// Snowflake has no KEY_COLUMN_USAGE view, so keys come from SHOW, which takes an identifier not a bind
export const showPrimaryKeysQuery = (schema: string, table: string) =>
  `SHOW PRIMARY KEYS IN TABLE ${quoteSnowflakeIdent(schema)}.${quoteSnowflakeIdent(table)}`;

export const showImportedKeysQuery = (schema: string, table: string) =>
  `SHOW IMPORTED KEYS IN TABLE ${quoteSnowflakeIdent(schema)}.${quoteSnowflakeIdent(table)}`;

type TShowKeyRow = Record<string, unknown>;

const readCell = (row: TShowKeyRow, key: string): string => {
  const value = row[key] ?? row[key.toUpperCase()];
  return typeof value === "string" ? value : String(value ?? "");
};

const readSequence = (row: TShowKeyRow): number => {
  const value = row.key_sequence ?? row.KEY_SEQUENCE;
  return Number(value ?? 0);
};

export const toPrimaryKeys = (rows: TShowKeyRow[]): string[] =>
  [...rows]
    .sort((a, b) => readSequence(a) - readSequence(b))
    .map((row) => readCell(row, "column_name"))
    .filter(Boolean);

export type TForeignKey = {
  constraintName: string;
  columns: string[];
  targetSchema: string;
  targetTable: string;
  targetColumns: string[];
};

export const toForeignKeys = (rows: TShowKeyRow[]): TForeignKey[] => {
  const byConstraint = new Map<string, TForeignKey>();

  for (const row of [...rows].sort((a, b) => readSequence(a) - readSequence(b))) {
    const constraintName = readCell(row, "fk_name");
    const existing = byConstraint.get(constraintName);
    const foreignKey = existing ?? {
      constraintName,
      columns: [],
      targetSchema: readCell(row, "pk_schema_name"),
      targetTable: readCell(row, "pk_table_name"),
      targetColumns: []
    };

    foreignKey.columns.push(readCell(row, "fk_column_name"));
    foreignKey.targetColumns.push(readCell(row, "pk_column_name"));
    if (!existing) byConstraint.set(constraintName, foreignKey);
  }

  return [...byConstraint.values()];
};

export type TColumnRow = {
  name: string;
  type: string;
  isNullable: string;
  identityGeneration: string | null;
};

export const toColumns = (rows: TColumnRow[]) =>
  rows.map((row) => ({
    name: row.name,
    type: row.type,
    nullable: row.isNullable?.toUpperCase() === "YES",
    identityGeneration: row.identityGeneration || null
  }));
