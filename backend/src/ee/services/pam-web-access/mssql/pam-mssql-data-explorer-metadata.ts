const OBJECT_ID_EXPR = "OBJECT_ID(QUOTENAME(@schema) + '.' + QUOTENAME(@table))";

export const getSchemasQuery = () => ({
  sql: `
    SELECT s.name AS name
    FROM sys.schemas s
    WHERE s.name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')
      AND s.schema_id NOT BETWEEN 16384 AND 16399
    ORDER BY s.name
  `,
  params: {} as Record<string, string>
});

export const getTablesQuery = (schema: string) => ({
  sql: `
    SELECT
      o.name AS name,
      CASE o.type WHEN 'U' THEN 'table' ELSE 'view' END AS tableType
    FROM sys.objects o
    WHERE o.schema_id = SCHEMA_ID(@schema)
      AND o.type IN ('U', 'V')
      AND o.is_ms_shipped = 0
    ORDER BY o.name
  `,
  params: { schema }
});

// Alias types resolve to their base type; identity/computed/rowversion are ALWAYS; hidden and column-set sparse columns are skipped
export const getColumnsQuery = (schema: string, table: string) => ({
  sql: `
    SELECT
      c.name AS name,
      CASE
        WHEN b.name IN ('varchar', 'char', 'varbinary', 'binary')
          THEN b.name + '(' + CASE WHEN c.max_length = -1 THEN 'max' ELSE CAST(c.max_length AS varchar(10)) END + ')'
        WHEN b.name IN ('nvarchar', 'nchar')
          THEN b.name + '(' + CASE WHEN c.max_length = -1 THEN 'max' ELSE CAST(c.max_length / 2 AS varchar(10)) END + ')'
        WHEN b.name IN ('decimal', 'numeric')
          THEN b.name + '(' + CAST(c.precision AS varchar(10)) + ',' + CAST(c.scale AS varchar(10)) + ')'
        WHEN b.name IN ('datetime2', 'time', 'datetimeoffset')
          THEN b.name + '(' + CAST(c.scale AS varchar(10)) + ')'
        ELSE b.name
      END AS type,
      c.is_nullable AS nullable,
      CASE
        WHEN c.is_identity = 1 OR c.is_computed = 1 OR b.name = 'timestamp' THEN 'ALWAYS'
        ELSE NULL
      END AS identityGeneration
    FROM sys.columns c
    JOIN sys.types t ON t.user_type_id = c.user_type_id
    LEFT JOIN sys.types bt ON bt.user_type_id = c.system_type_id AND t.is_user_defined = 1 AND t.is_assembly_type = 0
    CROSS APPLY (SELECT COALESCE(bt.name, t.name) AS name) b
    WHERE c.object_id = ${OBJECT_ID_EXPR}
      AND c.is_hidden = 0
      AND NOT (
        c.is_sparse = 1
        AND EXISTS (SELECT 1 FROM sys.columns cs WHERE cs.object_id = c.object_id AND cs.is_column_set = 1)
      )
    ORDER BY c.column_id
  `,
  params: { schema, table }
});

export const getPrimaryKeysQuery = (schema: string, table: string) => ({
  sql: `
    SELECT c.name AS name
    FROM sys.indexes i
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.is_primary_key = 1 AND i.object_id = ${OBJECT_ID_EXPR}
    ORDER BY ic.key_ordinal
  `,
  params: { schema, table }
});

export const getForeignKeysQuery = (schema: string, table: string) => ({
  sql: `
    SELECT
      fk.name AS constraintName,
      pc.name AS columnName,
      SCHEMA_NAME(rt.schema_id) AS targetSchema,
      rt.name AS targetTable,
      rc.name AS targetColumn
    FROM sys.foreign_keys fk
    JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
    JOIN sys.objects rt ON rt.object_id = fk.referenced_object_id
    JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
    WHERE fk.parent_object_id = ${OBJECT_ID_EXPR}
    ORDER BY fk.name, fkc.constraint_column_id
  `,
  params: { schema, table }
});

export type TForeignKeyColumnRow = {
  constraintName: string;
  columnName: string;
  targetSchema: string;
  targetTable: string;
  targetColumn: string;
};

export const groupForeignKeys = (rows: TForeignKeyColumnRow[]) => {
  const byName = new Map<
    string,
    { constraintName: string; columns: string[]; targetSchema: string; targetTable: string; targetColumns: string[] }
  >();
  for (const row of rows) {
    let fk = byName.get(row.constraintName);
    if (!fk) {
      fk = {
        constraintName: row.constraintName,
        columns: [],
        targetSchema: row.targetSchema,
        targetTable: row.targetTable,
        targetColumns: []
      };
      byName.set(row.constraintName, fk);
    }
    fk.columns.push(row.columnName);
    fk.targetColumns.push(row.targetColumn);
  }
  return Array.from(byName.values());
};
