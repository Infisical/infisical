import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.OrgMembership, "lastInvitedAt");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.OrgMembership, (t) => {
      t.datetime("lastInvitedAt").nullable().defaultTo(knex.fn.now()).alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.OrgMembership, "lastInvitedAt");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.OrgMembership, (t) => {
      t.datetime("lastInvitedAt").nullable().alter();
    });
  }
}
