import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const lastUserLoggedInAuthMethod = await knex.schema.hasColumn(TableName.OrgMembership, "lastLoggedInAuthMethod");
  const lastIdentityLoggedInAuthMethod = await knex.schema.hasColumn(
    TableName.IdentityOrgMembership,
    "lastLoggedInAuthMethod"
  );
  if (!lastUserLoggedInAuthMethod) {
    await knex.schema.alterTable(TableName.OrgMembership, (t) => {
      t.string("lastLoggedInAuthMethod").nullable();
    });
  }

  if (!lastIdentityLoggedInAuthMethod) {
    await knex.schema.alterTable(TableName.IdentityOrgMembership, (t) => {
      t.string("lastLoggedInAuthMethod").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const lastUserLoggedInAuthMethod = await knex.schema.hasColumn(TableName.OrgMembership, "lastLoggedInAuthMethod");
  const lastIdentityLoggedInAuthMethod = await knex.schema.hasColumn(
    TableName.IdentityOrgMembership,
    "lastLoggedInAuthMethod"
  );
  if (!lastUserLoggedInAuthMethod) {
    await knex.schema.alterTable(TableName.OrgMembership, (t) => {
      t.dropColumn("lastLoggedInAuthMethod");
    });
  }

  if (!lastIdentityLoggedInAuthMethod) {
    await knex.schema.alterTable(TableName.IdentityOrgMembership, (t) => {
      t.dropColumn("lastLoggedInAuthMethod");
    });
  }
}
