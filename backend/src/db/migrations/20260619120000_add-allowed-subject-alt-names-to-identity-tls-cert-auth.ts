import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.IdentityTlsCertAuth, "allowedSubjectAltNames");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.IdentityTlsCertAuth, (t) => {
      t.text("allowedSubjectAltNames").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.IdentityTlsCertAuth, "allowedSubjectAltNames");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.IdentityTlsCertAuth, (t) => {
      t.dropColumn("allowedSubjectAltNames");
    });
  }
}
