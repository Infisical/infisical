import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasMappingField = await knex.schema.hasColumn(TableName.IdentityOidcAuth, "claimMetadataMapping");
  if (!hasMappingField) {
    await knex.schema.alterTable(TableName.IdentityOidcAuth, (t) => {
      t.jsonb("claimMetadataMapping");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasMappingField = await knex.schema.hasColumn(TableName.IdentityOidcAuth, "claimMetadataMapping");
  if (hasMappingField) {
    await knex.schema.alterTable(TableName.IdentityOidcAuth, (t) => {
      t.dropColumn("claimMetadataMapping");
    });
  }
}
