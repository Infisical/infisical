import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.IdentityMetadata))) {
    await knex.schema.createTable(TableName.IdentityMetadata, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.string("key").notNullable();
      tb.string("value").notNullable();
      tb.uuid("orgId").notNullable();
      tb.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      tb.uuid("userId");
      tb.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      tb.uuid("identityId");
      tb.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
      tb.timestamps(true, true, true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.IdentityMetadata);
}
