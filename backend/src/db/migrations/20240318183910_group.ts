import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Groups))) {
    await knex.schema.createTable(TableName.Groups, (t) => {
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

  await createOnUpdateTrigger(knex, TableName.Groups);

  if (!(await knex.schema.hasTable(TableName.UserGroupMembership))) {
    await knex.schema.createTable(TableName.UserGroupMembership, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid()); // link to user and link to groups cascade on groups
      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.uuid("groupId").notNullable();
      t.foreign("groupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.UserGroupMembership);

  if (!(await knex.schema.hasTable(TableName.GroupProjectMembership))) {
    await knex.schema.createTable(TableName.GroupProjectMembership, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("groupId").notNullable();
      t.foreign("groupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.GroupProjectMembership);

  if (!(await knex.schema.hasTable(TableName.GroupProjectMembershipRole))) {
    await knex.schema.createTable(TableName.GroupProjectMembershipRole, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("role").notNullable();
      t.uuid("projectMembershipId").notNullable();
      t.foreign("projectMembershipId").references("id").inTable(TableName.GroupProjectMembership).onDelete("CASCADE");
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

  await createOnUpdateTrigger(knex, TableName.GroupProjectMembershipRole);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.GroupProjectMembershipRole);
  await dropOnUpdateTrigger(knex, TableName.GroupProjectMembershipRole);

  await knex.schema.dropTableIfExists(TableName.UserGroupMembership);
  await dropOnUpdateTrigger(knex, TableName.UserGroupMembership);

  await knex.schema.dropTableIfExists(TableName.GroupProjectMembership);
  await dropOnUpdateTrigger(knex, TableName.GroupProjectMembership);

  await knex.schema.dropTableIfExists(TableName.Groups);
  await dropOnUpdateTrigger(knex, TableName.Groups);
}
