// ClickHouse has no schema layer under a database, so the explorer's "schemas" are databases.
export const SCHEMAS_QUERY = `SELECT name AS name
  FROM system.databases
  WHERE name NOT IN ('INFORMATION_SCHEMA', 'information_schema')
  ORDER BY name`;

export const TABLES_QUERY = `SELECT
    name AS name,
    multiIf(engine = 'View', 'view', engine = 'MaterializedView', 'materialized_view', 'table') AS tableType
  FROM system.tables
  WHERE database = {schema:String}
  ORDER BY name`;

// Nullability lives in the type itself (Nullable(T)), and the sorting key columns are what ClickHouse
// calls the primary key -- an index, not a unique constraint, which is why the grid stays read-only.
export const COLUMNS_QUERY = `SELECT
    name AS name,
    type AS type,
    startsWith(type, 'Nullable(') AS nullable,
    is_in_primary_key AS isInPrimaryKey
  FROM system.columns
  WHERE database = {schema:String} AND table = {table:String}
  ORDER BY position`;

export type TColumnRow = {
  name: string;
  type: string;
  nullable: number | boolean;
  isInPrimaryKey: number | boolean;
};

// UInt8 comes back as a number in JSON and as a string in some driver paths
const asBool = (value: number | boolean | string): boolean => value === true || value === 1 || value === "1";

export const toColumns = (rows: TColumnRow[]) =>
  rows.map((row) => ({
    name: row.name,
    type: row.type,
    nullable: asBool(row.nullable),
    identityGeneration: null
  }));

export const toPrimaryKeys = (rows: TColumnRow[]): string[] =>
  rows.filter((row) => asBool(row.isInPrimaryKey)).map((row) => row.name);
