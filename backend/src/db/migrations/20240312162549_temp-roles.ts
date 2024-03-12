import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const doesTableExist = await knex.schema.hasTable(TableName.ProjectUserMembershipRole);
  if (!doesTableExist) {
    await knex.schema.createTable(TableName.ProjectUserMembershipRole, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("role").notNullable();
      t.uuid("projectMembershipId").notNullable();
      t.foreign("projectMembershipId").references("id").inTable(TableName.ProjectMembership).onDelete("CASCADE");
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

  await createOnUpdateTrigger(knex, TableName.ProjectUserMembershipRole);

  const projectMemberships = await knex(TableName.ProjectMembership).select(
    "id",
    "role",
    "createdAt",
    "updatedAt",
    knex.ref("roleId").withSchema(TableName.ProjectMembership).as("customRoleId")
  );
  if (projectMemberships.length)
    await knex.batchInsert(
      TableName.ProjectUserMembershipRole,
      projectMemberships.map((data) => ({ ...data, projectMembershipId: data.id }))
    );
  // will be dropped later
  // await knex.schema.alterTable(TableName.ProjectMembership, (t) => {
  //   t.dropColumn("roleId");
  //   t.dropColumn("role");
  // });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ProjectUserMembershipRole);
  await dropOnUpdateTrigger(knex, TableName.ProjectUserMembershipRole);
}
