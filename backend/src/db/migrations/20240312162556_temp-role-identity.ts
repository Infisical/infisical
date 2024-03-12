import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const doesTableExist = await knex.schema.hasTable(TableName.IdentityProjectMembershipRole);
  if (!doesTableExist) {
    await knex.schema.createTable(TableName.IdentityProjectMembershipRole, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("role").notNullable();
      t.uuid("projectMembershipId").notNullable();
      t.foreign("projectMembershipId")
        .references("id")
        .inTable(TableName.IdentityProjectMembership)
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

  await createOnUpdateTrigger(knex, TableName.IdentityProjectMembershipRole);

  const identityMemberships = await knex(TableName.IdentityProjectMembership).select(
    "id",
    "role",
    "createdAt",
    "updatedAt",
    knex.ref("roleId").withSchema(TableName.IdentityProjectMembership).as("customRoleId")
  );
  if (identityMemberships.length)
    await knex.batchInsert(
      TableName.IdentityProjectMembershipRole,
      identityMemberships.map((data) => ({ ...data, projectMembershipId: data.id }))
    );
  // await knex.schema.alterTable(TableName.IdentityProjectMembership, (t) => {
  //   t.dropColumn("roleId");
  //   t.dropColumn("role");
  // });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.IdentityProjectMembershipRole);
  await dropOnUpdateTrigger(knex, TableName.IdentityProjectMembershipRole);
}
