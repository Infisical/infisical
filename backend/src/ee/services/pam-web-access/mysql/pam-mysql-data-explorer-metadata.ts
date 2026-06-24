export const getSchemasQuery = () => ({
  sql: `
    SELECT SCHEMA_NAME AS name
    FROM information_schema.SCHEMATA
    WHERE SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
    ORDER BY SCHEMA_NAME
  `,
  values: [] as string[]
});

export const getTablesQuery = (schema: string) => ({
  sql: `
    SELECT
      TABLE_NAME AS name,
      CASE TABLE_TYPE
        WHEN 'BASE TABLE' THEN 'table'
        WHEN 'VIEW' THEN 'view'
        WHEN 'SYSTEM VIEW' THEN 'view'
        ELSE 'other'
      END AS tableType
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME
  `,
  values: [schema]
});

export const getTableDetailQuery = (schema: string, table: string) => ({
  sql: `
    SELECT JSON_OBJECT(
      'columns', COALESCE((
        SELECT JSON_ARRAYAGG(
          JSON_OBJECT(
            'name', c.COLUMN_NAME,
            'type', c.COLUMN_TYPE,
            'nullable', IF(c.IS_NULLABLE = 'YES', TRUE, FALSE),
            'identityGeneration', CASE
              WHEN c.EXTRA LIKE '%auto_increment%' THEN 'AUTO_INCREMENT'
              ELSE NULL
            END
          )
          ORDER BY c.ORDINAL_POSITION
        )
        FROM information_schema.COLUMNS c
        WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
      ), JSON_ARRAY()),
      'primaryKeys', COALESCE((
        SELECT JSON_ARRAYAGG(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION)
        FROM information_schema.KEY_COLUMN_USAGE kcu
        JOIN information_schema.TABLE_CONSTRAINTS tc
          ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
          AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
          AND tc.TABLE_NAME = kcu.TABLE_NAME
        WHERE kcu.TABLE_SCHEMA = ? AND kcu.TABLE_NAME = ?
          AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
      ), JSON_ARRAY()),
      'foreignKeys', COALESCE((
        SELECT JSON_ARRAYAGG(
          JSON_OBJECT(
            'constraintName', fk_info.CONSTRAINT_NAME,
            'columns', fk_info.fk_columns,
            'targetSchema', fk_info.REFERENCED_TABLE_SCHEMA,
            'targetTable', fk_info.REFERENCED_TABLE_NAME,
            'targetColumns', fk_info.ref_columns
          )
        )
        FROM (
          SELECT
            kcu.CONSTRAINT_NAME,
            kcu.REFERENCED_TABLE_SCHEMA,
            kcu.REFERENCED_TABLE_NAME,
            JSON_ARRAYAGG(kcu.COLUMN_NAME) AS fk_columns,
            JSON_ARRAYAGG(kcu.REFERENCED_COLUMN_NAME) AS ref_columns
          FROM information_schema.KEY_COLUMN_USAGE kcu
          JOIN information_schema.TABLE_CONSTRAINTS tc
            ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
            AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
            AND tc.TABLE_NAME = kcu.TABLE_NAME
          WHERE kcu.TABLE_SCHEMA = ? AND kcu.TABLE_NAME = ?
            AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
          GROUP BY kcu.CONSTRAINT_NAME, kcu.REFERENCED_TABLE_SCHEMA, kcu.REFERENCED_TABLE_NAME
        ) fk_info
      ), JSON_ARRAY())
    ) AS result
  `,
  values: [schema, table, schema, table, schema, table]
});
