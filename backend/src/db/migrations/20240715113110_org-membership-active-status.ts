import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.OrgMembership)) {
    await knex.schema.alterTable(TableName.OrgMembership, (t) => {
      t.boolean("isActive").nullable();
    });

    await knex(TableName.OrgMembership).update("isActive", true);

    await knex.schema.alterTable(TableName.OrgMembership, (t) => {
      t.boolean("isActive").notNullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.OrgMembership)) {
    await knex.schema.alterTable(TableName.OrgMembership, (t) => {
      t.dropColumn("isActive");
    });
  }
}
