import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const columns = await knex.table(TableName.Organization).columnInfo();

  await knex.schema.alterTable(TableName.Organization, (t) => {
    if (!columns.secretsProductEnabled) {
      t.boolean("secretsProductEnabled").defaultTo(true);
    }
    if (!columns.pkiProductEnabled) {
      t.boolean("pkiProductEnabled").defaultTo(true);
    }
    if (!columns.kmsProductEnabled) {
      t.boolean("kmsProductEnabled").defaultTo(true);
    }
    // "in" check: the sshProductEnabled column was dropped (with the SSH product) from the
    // organizations schema type, so it can no longer be keyed on the typed columnInfo record
    if (!("sshProductEnabled" in columns)) {
      t.boolean("sshProductEnabled").defaultTo(true);
    }
    if (!columns.scannerProductEnabled) {
      t.boolean("scannerProductEnabled").defaultTo(true);
    }
    if (!columns.shareSecretsProductEnabled) {
      t.boolean("shareSecretsProductEnabled").defaultTo(true);
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const columns = await knex.table(TableName.Organization).columnInfo();

  await knex.schema.alterTable(TableName.Organization, (t) => {
    if (columns.secretsProductEnabled) {
      t.dropColumn("secretsProductEnabled");
    }
    if (columns.pkiProductEnabled) {
      t.dropColumn("pkiProductEnabled");
    }
    if (columns.kmsProductEnabled) {
      t.dropColumn("kmsProductEnabled");
    }
    if ("sshProductEnabled" in columns) {
      t.dropColumn("sshProductEnabled");
    }
    if (columns.scannerProductEnabled) {
      t.dropColumn("scannerProductEnabled");
    }
    if (columns.shareSecretsProductEnabled) {
      t.dropColumn("shareSecretsProductEnabled");
    }
  });
}
