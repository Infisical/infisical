import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.IdentityTlsCertAuth, "bindAccessTokenToCertificate");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.IdentityTlsCertAuth, (t) => {
      t.boolean("bindAccessTokenToCertificate").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.IdentityTlsCertAuth, "bindAccessTokenToCertificate");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.IdentityTlsCertAuth, (t) => {
      t.dropColumn("bindAccessTokenToCertificate");
    });
  }
}
