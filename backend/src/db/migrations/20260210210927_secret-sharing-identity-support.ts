import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasIdentityIdColumn = await knex.schema.hasColumn(TableName.SecretSharing, "identityId");
  if (!hasIdentityIdColumn) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      t.uuid("identityId");
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasIdentityIdColumn = await knex.schema.hasColumn(TableName.SecretSharing, "identityId");
  if (hasIdentityIdColumn) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      t.dropForeign("identityId");
      t.dropColumn("identityId");
    });
  }
}
