import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.IdentityMetadata))) {
    await knex.schema.createTable(TableName.IdentityMetadata, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.string("key").notNullable();
      tb.string("value").notNullable();
      tb.uuid("userOrgMembershipId");
      tb.foreign("userOrgMembershipId").references("id").inTable(TableName.OrgMembership).onDelete("CASCADE");
      tb.uuid("identityOrgMembershipId");
      tb.foreign("identityOrgMembershipId")
        .references("id")
        .inTable(TableName.IdentityOrgMembership)
        .onDelete("CASCADE");
      tb.timestamps(true, true, true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.IdentityMetadata);
}
