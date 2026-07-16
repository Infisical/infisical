import { Knex } from "knex";

import { TableName } from "../schemas";

type TFk = { table: TableName; column: string; originalOnDelete?: "RESTRICT" };

// Only the FKs that currently BLOCK the cascade (NO ACTION default, or RESTRICT). FKs already on
// CASCADE / SET NULL never block a parent delete and are intentionally left alone.
const BLOCKING_APP_CONNECTION_FKS: TFk[] = [
  { table: TableName.SecretSync, column: "connectionId" },
  { table: TableName.SecretRotationV2, column: "connectionId" },
  { table: TableName.ExternalCertificateAuthority, column: "appConnectionId" },
  { table: TableName.ExternalCertificateAuthority, column: "dnsAppConnectionId" },
  { table: TableName.SecretScanningDataSource, column: "connectionId" },
  { table: TableName.PkiSync, column: "connectionId" },
  { table: TableName.ExternalMigrationConfig, column: "connectionId" },
  { table: TableName.VaultExternalMigrationConfig, column: "connectionId" },
  { table: TableName.HoneyTokenConfig, column: "connectionId" },
  { table: TableName.PamProjectRecordingConfig, column: "connectionId", originalOnDelete: "RESTRICT" }
];

export async function up(knex: Knex): Promise<void> {
  // Drop + re-add takes a brief ACCESS EXCLUSIVE lock and revalidates each table.
  await knex.raw("SET LOCAL lock_timeout = '10s'");

  for (const { table, column } of BLOCKING_APP_CONNECTION_FKS) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await knex.schema.hasTable(table)) || !(await knex.schema.hasColumn(table, column))) {
      // eslint-disable-next-line no-continue
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await knex.schema.alterTable(table, (t) => {
      t.dropForeign([column]);
      t.foreign(column).references("id").inTable(TableName.AppConnection).deferrable("deferred");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '10s'");

  for (const { table, column, originalOnDelete } of BLOCKING_APP_CONNECTION_FKS) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await knex.schema.hasTable(table)) || !(await knex.schema.hasColumn(table, column))) {
      // eslint-disable-next-line no-continue
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await knex.schema.alterTable(table, (t) => {
      t.dropForeign([column]);
      const fk = t.foreign(column).references("id").inTable(TableName.AppConnection);
      if (originalOnDelete === "RESTRICT") fk.onDelete("RESTRICT");
    });
  }
}
