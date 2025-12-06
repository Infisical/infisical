import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasSubOrganizationIdColumn = await knex.schema.hasColumn(TableName.IdentityAccessToken, "subOrganizationId");
  if (!hasSubOrganizationIdColumn) {
    await knex.schema.alterTable(TableName.IdentityAccessToken, (t) => {
      t.uuid("subOrganizationId").nullable();
      t.foreign("subOrganizationId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasSubOrganizationIdColumn = await knex.schema.hasColumn(TableName.IdentityAccessToken, "subOrganizationId");
  if (hasSubOrganizationIdColumn) {
    await knex.schema.alterTable(TableName.IdentityAccessToken, (t) => {
      t.dropColumn("subOrganizationId");
    });
  }
}
