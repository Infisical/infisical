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

  if (!(await knex.schema.hasTable(TableName.IdentityGroupMembership))) {
    await knex.schema.createTable(TableName.IdentityGroupMembership, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("identityId").notNullable();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
      t.uuid("groupId").notNullable();
      t.foreign("groupId").references("id").inTable(TableName.IdentityGroups).onDelete("CASCADE");
      t.unique(["identityId", "groupId"]);
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.IdentityGroupMembership);

  if (!(await knex.schema.hasTable(TableName.IdentityGroupProjectMembership))) {
    await knex.schema.createTable(TableName.IdentityGroupProjectMembership, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("groupId").notNullable();
      t.foreign("groupId").references("id").inTable(TableName.IdentityGroups).onDelete("CASCADE");
      t.unique(["projectId", "groupId"]);
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.IdentityGroupProjectMembership);

  if (!(await knex.schema.hasTable(TableName.IdentityGroupProjectMembershipRole))) {
    await knex.schema.createTable(TableName.IdentityGroupProjectMembershipRole, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("role").notNullable();
      t.uuid("projectMembershipId").notNullable();
      t.foreign("projectMembershipId")
        .references("id")
        .inTable(TableName.IdentityGroupProjectMembership)
        .onDelete("CASCADE");
      // until role is changed/removed the role should not deleted
      t.uuid("customRoleId");
      t.foreign("customRoleId").references("id").inTable(TableName.ProjectRoles);
      t.boolean("isTemporary").notNullable().defaultTo(false);
      t.string("temporaryMode");
      t.string("temporaryRange"); // could be cron or relative time like 1H or 1minute etc
      t.datetime("temporaryAccessStartTime");
      t.datetime("temporaryAccessEndTime");
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.IdentityGroupProjectMembershipRole);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.IdentityGroupProjectMembershipRole);
  await dropOnUpdateTrigger(knex, TableName.IdentityGroupProjectMembershipRole);

  await knex.schema.dropTableIfExists(TableName.IdentityGroupMembership);
  await dropOnUpdateTrigger(knex, TableName.IdentityGroupMembership);

  await knex.schema.dropTableIfExists(TableName.IdentityGroupProjectMembership);
  await dropOnUpdateTrigger(knex, TableName.IdentityGroupProjectMembership);

  await knex.schema.dropTableIfExists(TableName.IdentityGroups);
  await dropOnUpdateTrigger(knex, TableName.IdentityGroups);
}
