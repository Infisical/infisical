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
    if (!columns.sshProductEnabled) {
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
    if (columns.sshProductEnabled) {
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
