import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.Organization, (t) => {
    t.boolean("secretsProductEnabled").defaultTo(true);
    t.boolean("pkiProductEnabled").defaultTo(true);
    t.boolean("kmsProductEnabled").defaultTo(true);
    t.boolean("sshProductEnabled").defaultTo(true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.Organization, (t) => {
    t.dropColumn("secretsProductEnabled");
    t.dropColumn("pkiProductEnabled");
    t.dropColumn("kmsProductEnabled");
    t.dropColumn("sshProductEnabled");
  });
}
