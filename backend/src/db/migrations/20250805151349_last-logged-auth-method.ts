import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const lastUserLoggedInAuthMethod = await knex.schema.hasColumn(TableName.OrgMembership, "lastLoginAuthMethod");
  const lastIdentityLoggedInAuthMethod = await knex.schema.hasColumn(
    TableName.IdentityOrgMembership,
    "lastLoginAuthMethod"
  );
  const lastUserLoggedInTime = await knex.schema.hasColumn(TableName.OrgMembership, "lastLoginTime");
  const lastIdentityLoggedInTime = await knex.schema.hasColumn(TableName.IdentityOrgMembership, "lastLoginTime");
  if (!lastUserLoggedInAuthMethod || !lastUserLoggedInTime) {
    await knex.schema.alterTable(TableName.OrgMembership, (t) => {
      if (!lastUserLoggedInAuthMethod) {
        t.string("lastLoginAuthMethod").nullable();
      }
      if (!lastUserLoggedInTime) {
        t.datetime("lastLoginTime").nullable();
      }
    });
  }

  if (!lastIdentityLoggedInAuthMethod || !lastIdentityLoggedInTime) {
    await knex.schema.alterTable(TableName.IdentityOrgMembership, (t) => {
      if (!lastIdentityLoggedInAuthMethod) {
        t.string("lastLoginAuthMethod").nullable();
      }
      if (!lastIdentityLoggedInTime) {
        t.datetime("lastLoginTime").nullable();
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const lastUserLoggedInAuthMethod = await knex.schema.hasColumn(TableName.OrgMembership, "lastLoginAuthMethod");
  const lastIdentityLoggedInAuthMethod = await knex.schema.hasColumn(
    TableName.IdentityOrgMembership,
    "lastLoginAuthMethod"
  );
  const lastUserLoggedInTime = await knex.schema.hasColumn(TableName.OrgMembership, "lastLoginTime");
  const lastIdentityLoggedInTime = await knex.schema.hasColumn(TableName.IdentityOrgMembership, "lastLoginTime");
  if (lastUserLoggedInAuthMethod || lastUserLoggedInTime) {
    await knex.schema.alterTable(TableName.OrgMembership, (t) => {
      if (lastUserLoggedInAuthMethod) {
        t.dropColumn("lastLoginAuthMethod");
      }
      if (lastUserLoggedInTime) {
        t.dropColumn("lastLoginTime");
      }
    });
  }

  if (lastIdentityLoggedInAuthMethod || lastIdentityLoggedInTime) {
    await knex.schema.alterTable(TableName.IdentityOrgMembership, (t) => {
      if (lastIdentityLoggedInAuthMethod) {
        t.dropColumn("lastLoginAuthMethod");
      }
      if (lastIdentityLoggedInTime) {
        t.dropColumn("lastLoginTime");
      }
    });
  }
}
