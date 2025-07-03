import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.OrgMembership, "lastInvitedAt");
  await knex.schema.alterTable(TableName.OrgMembership, (t) => {
    if (!hasColumn) {
      t.datetime("lastInvitedAt").nullable();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.OrgMembership, "lastInvitedAt");
  await knex.schema.alterTable(TableName.OrgMembership, (t) => {
    if (hasColumn) {
      t.dropColumn("lastInvitedAt");
    }
  });
}
