import { Knex } from "knex";

import { SecretScanningScanStatus } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

import { TableName } from "../schemas";

const SCANNING_STARTED_AT_INDEX = "secret_scanning_scans_scanning_started_at_index";

export async function up(knex: Knex): Promise<void> {
  const hasScanningStartedAt = await knex.schema.hasColumn(TableName.SecretScanningScan, "scanningStartedAt");

  await knex.schema.alterTable(TableName.SecretScanningScan, (t) => {
    if (!hasScanningStartedAt) {
      // When the worker picked the job up, as distinct from when the scan was enqueued. The reaper
      // measures against this so a scan that sat in a queue backlog isn't mistaken for a hung one.
      t.datetime("scanningStartedAt").nullable();
      // Partial index: the reaper only ever scans rows still in progress, which is a tiny slice of
      // a table that is otherwise all completed/failed history.
      // whereRaw, not where: Postgres rejects bound parameters in DDL, and the query-builder form
      // emits the status as a placeholder.
      t.index(["scanningStartedAt"], SCANNING_STARTED_AT_INDEX, {
        predicate: knex.whereRaw(`status = '${SecretScanningScanStatus.Scanning}'`)
      });
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasScanningStartedAt = await knex.schema.hasColumn(TableName.SecretScanningScan, "scanningStartedAt");

  await knex.schema.alterTable(TableName.SecretScanningScan, (t) => {
    if (hasScanningStartedAt) {
      t.dropIndex(["scanningStartedAt"], SCANNING_STARTED_AT_INDEX);
      t.dropColumn("scanningStartedAt");
    }
  });
}
