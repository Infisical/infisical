import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.Organization, "createdByUserId");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      // Null for organizations that predate this column, and for orgs created from the admin panel
      // (super-admin-service createOrganization passes no user), so neither counts against anyone's
      // create limit. Instance bootstrap does pass the admin's id, so that org is attributed to them.
      // Not backfilled: the nearest proxy for an existing org's creator is its oldest admin, which
      // mis-attributes any org whose creator has left and would lock that admin out of creating one.
      t.uuid("createdByUserId").nullable();
      t.foreign("createdByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      t.index("createdByUserId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.Organization, "createdByUserId");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.dropColumn("createdByUserId");
    });
  }
}
