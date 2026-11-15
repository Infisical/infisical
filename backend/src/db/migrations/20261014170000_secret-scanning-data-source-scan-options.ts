import { Knex } from "knex";

import { TableName } from "../schemas";

const NEW_COLUMNS = ["isHistoricalScanEnabled", "isScanNewCommitsEnabled", "isDiscoveryEnabled"] as const;

export async function up(knex: Knex): Promise<void> {
  const hasColumns = await Promise.all(
    NEW_COLUMNS.map((column) => knex.schema.hasColumn(TableName.SecretScanningDataSource, column))
  );
  if (hasColumns.every(Boolean)) return;

  await knex.schema.alterTable(TableName.SecretScanningDataSource, (t) => {
    if (!hasColumns[0]) t.boolean("isHistoricalScanEnabled").notNullable().defaultTo(true);
    if (!hasColumns[1]) t.boolean("isScanNewCommitsEnabled").notNullable().defaultTo(true);
    if (!hasColumns[2]) t.boolean("isDiscoveryEnabled").notNullable().defaultTo(true);
  });

  // isAutoScanEnabled gated both the initial full scan and push-triggered scans, so both new flags inherit it.
  // Discovery was implicit in an include list of ["*"], which also picks up repositories added later.
  await knex.raw(
    `UPDATE ?? SET
       "isHistoricalScanEnabled" = COALESCE("isAutoScanEnabled", true),
       "isScanNewCommitsEnabled" = COALESCE("isAutoScanEnabled", true),
       "isDiscoveryEnabled" = COALESCE(config->'includeRepos' @> '["*"]'::jsonb OR config->'includeProjects' @> '["*"]'::jsonb, false)`,
    [TableName.SecretScanningDataSource]
  );
}

export async function down(knex: Knex): Promise<void> {
  const hasColumns = await Promise.all(
    NEW_COLUMNS.map((column) => knex.schema.hasColumn(TableName.SecretScanningDataSource, column))
  );
  const existingColumns = NEW_COLUMNS.filter((_, index) => hasColumns[index]);
  if (!existingColumns.length) return;

  // The analytics view selects these columns, and Postgres won't drop a column a view uses. The next
  // regeneration recreates the view without them.
  await knex.raw(`DROP VIEW IF EXISTS analytics.??`, [TableName.SecretScanningDataSource]);
  await knex.schema.alterTable(TableName.SecretScanningDataSource, (t) => {
    t.dropColumns(...existingColumns);
  });
}
