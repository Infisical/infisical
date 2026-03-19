// System catalog SQL queries for the Postgres Data Browser.
// All queries use parameterized inputs ($1, $2) — no string interpolation.

export const getSchemasQuery = () => ({
  text: `
    SELECT nspname AS name
    FROM pg_namespace
    WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND nspname NOT LIKE 'pg_temp_%'
      AND nspname NOT LIKE 'pg_toast_temp_%'
    ORDER BY nspname
  `,
  values: [] as string[]
});

export const getTablesQuery = (schema: string) => ({
  text: `
    SELECT
      c.relname AS name,
      CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized_view'
        WHEN 'f' THEN 'foreign_table'
        WHEN 'p' THEN 'partitioned_table'
        ELSE 'other'
      END AS "tableType"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1
      AND c.relkind IN ('r', 'v', 'm', 'f', 'p')
    ORDER BY c.relname
  `,
  values: [schema]
});

export const getTableDetailQuery = (schema: string, table: string) => ({
  // Returns a JSON object with columns, primaryKeys, foreignKeys, enums
  text: `
    WITH target AS (
      SELECT c.oid AS table_oid
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2
    ),
    cols AS (
      SELECT json_agg(
        json_build_object(
          'name', a.attname,
          'type', CASE WHEN a.attndims > 0 OR t.typelem != 0 AND t.typlen = -1
                       THEN (SELECT bt.typname FROM pg_type bt WHERE bt.oid = t.typelem) || '[]'
                       ELSE t.typname END,
          'typeOid', a.atttypid,
          'nullable', NOT a.attnotnull,
          'defaultValue', pg_get_expr(d.adbin, d.adrelid),
          'isIdentity', a.attidentity != '',
          'identityGeneration', CASE a.attidentity
            WHEN 'a' THEN 'ALWAYS'
            WHEN 'd' THEN 'BY DEFAULT'
            ELSE null END,
          'isArray', a.attndims > 0 OR (t.typelem != 0 AND t.typlen = -1),
          'maxLength', CASE WHEN a.atttypmod > 0 THEN a.atttypmod - 4 ELSE null END
        ) ORDER BY a.attnum
      ) AS data
      FROM pg_attribute a
      JOIN target ON a.attrelid = target.table_oid
      JOIN pg_type t ON t.oid = a.atttypid
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attnum > 0 AND NOT a.attisdropped
    ),
    pks AS (
      SELECT json_agg(a.attname ORDER BY arr.pos) AS data
      FROM pg_constraint con
      JOIN target ON con.conrelid = target.table_oid
      CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS arr(attnum, pos)
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = arr.attnum
      WHERE con.contype = 'p'
    ),
    fks AS (
      SELECT json_agg(
        json_build_object(
          'constraintName', con.conname,
          'columns', (
            SELECT json_agg(a.attname ORDER BY arr.pos)
            FROM unnest(con.conkey) WITH ORDINALITY AS arr(attnum, pos)
            JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = arr.attnum
          ),
          'targetSchema', tn.nspname,
          'targetTable', tc.relname,
          'targetColumns', (
            SELECT json_agg(a.attname ORDER BY arr.pos)
            FROM unnest(con.confkey) WITH ORDINALITY AS arr(attnum, pos)
            JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = arr.attnum
          )
        )
      ) AS data
      FROM pg_constraint con
      JOIN target ON con.conrelid = target.table_oid
      JOIN pg_class tc ON tc.oid = con.confrelid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE con.contype = 'f'
    ),
    enum_vals AS (
      SELECT json_object_agg(
        t.typname,
        (SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid)
      ) AS data
      FROM pg_attribute a
      JOIN target ON a.attrelid = target.table_oid
      JOIN pg_type t ON t.oid = a.atttypid
      WHERE a.attnum > 0
        AND NOT a.attisdropped
        AND t.typtype = 'e'
    )
    SELECT json_build_object(
      'columns', COALESCE(cols.data, '[]'::json),
      'primaryKeys', COALESCE(pks.data, '[]'::json),
      'foreignKeys', COALESCE(fks.data, '[]'::json),
      'enums', COALESCE(enum_vals.data, '{}'::json)
    ) AS result
    FROM cols, pks, fks, enum_vals
  `,
  values: [schema, table]
});
