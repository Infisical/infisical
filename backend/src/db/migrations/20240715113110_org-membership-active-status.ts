import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.OrgMembership)) {
    const doesUserIdExist = await knex.schema.hasColumn(TableName.OrgMembership, "userId");
    const doesOrgIdExist = await knex.schema.hasColumn(TableName.OrgMembership, "orgId");
    await knex.schema.alterTable(TableName.OrgMembership, (t) => {
      t.boolean("isActive").notNullable().defaultTo(true);
      if (doesUserIdExist && doesOrgIdExist) t.index(["userId", "orgId"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.OrgMembership)) {
    const doesUserIdExist = await knex.schema.hasColumn(TableName.OrgMembership, "userId");
    const doesOrgIdExist = await knex.schema.hasColumn(TableName.OrgMembership, "orgId");
    await knex.schema.alterTable(TableName.OrgMembership, (t) => {
      t.dropColumn("isActive");
      if (doesUserIdExist && doesOrgIdExist) t.dropIndex(["userId", "orgId"]);
    });
  }
}
