import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasParentOrgId = await knex.schema.hasColumn(TableName.Organization, "parentOrgId");
  if (!hasParentOrgId) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.uuid("parentOrgId");
      t.foreign("parentOrgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
    });
  }

  const hasIdentityOrgCol = await knex.schema.hasColumn(TableName.Identity, "orgId");
  if (!hasIdentityOrgCol) {
    await knex.schema.alterTable(TableName.Identity, (t) => {
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasParentOrgId = await knex.schema.hasColumn(TableName.Organization, "parentOrgId");
  if (hasParentOrgId) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.dropColumn("parentOrgId");
    });
  }

  const hasIdentityOrgCol = await knex.schema.hasColumn(TableName.Identity, "orgId");
  if (hasIdentityOrgCol) {
    await knex.schema.alterTable(TableName.Identity, (t) => {
      t.dropColumn("orgId");
    });
  }
}
