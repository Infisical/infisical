import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasParentOrgId = await knex.schema.hasColumn(TableName.Organization, "parentOrgId");
  if (!hasParentOrgId) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      // the one just above the chain
      t.uuid("parentOrgId");
      t.foreign("parentOrgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      // this would root organization containing various informations like billing etc
      t.uuid("rootOrgId");
      t.foreign("rootOrgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
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
  const hasRootOrgId = await knex.schema.hasColumn(TableName.Organization, "rootOrgId");
  if (hasParentOrgId || hasRootOrgId) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      if (hasParentOrgId) t.dropColumn("parentOrgId");
      if (hasRootOrgId) t.dropColumn("rootOrgId");
    });
  }

  const hasIdentityOrgCol = await knex.schema.hasColumn(TableName.Identity, "orgId");
  if (hasIdentityOrgCol) {
    await knex.schema.alterTable(TableName.Identity, (t) => {
      t.dropColumn("orgId");
    });
  }
}
