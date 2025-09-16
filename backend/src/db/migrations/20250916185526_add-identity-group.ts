import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.IdentityGroups))) {
    await knex.schema.createTable(TableName.IdentityGroups, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.string("name").notNullable();
      t.string("slug").notNullable();
      t.unique(["orgId", "slug"]);
      t.string("role").notNullable();
      t.uuid("roleId");
      t.foreign("roleId").references("id").inTable(TableName.OrgRoles);
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.IdentityGroups);

  if (!(await knex.schema.hasTable(TableName.IdentityUserGroupMembership))) {
    await knex.schema.createTable(TableName.IdentityUserGroupMembership, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid()); // link to user and link to groups cascade on groups
      t.uuid("identityId").notNullable();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
      t.uuid("identityGroupId").notNullable();
      t.foreign("identityGroupId").references("id").inTable(TableName.IdentityGroups).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.IdentityUserGroupMembership);

  if (!(await knex.schema.hasTable(TableName.IdentityGroupProjectMembership))) {
    await knex.schema.createTable(TableName.IdentityGroupProjectMembership, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("identityGroupId").notNullable();
      t.foreign("identityGroupId").references("id").inTable(TableName.IdentityGroups).onDelete("CASCADE");
      t.string("role").notNullable();
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.IdentityGroupProjectMembership);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.UserGroupMembership);
  await dropOnUpdateTrigger(knex, TableName.UserGroupMembership);

  await knex.schema.dropTableIfExists(TableName.GroupProjectMembership);
  await dropOnUpdateTrigger(knex, TableName.GroupProjectMembership);

  await knex.schema.dropTableIfExists(TableName.Groups);
  await dropOnUpdateTrigger(knex, TableName.Groups);
}
