import { Knex } from "knex";

import { TableName, TIdentityProjectMembershipRoleInsert } from "../schemas";
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

  const projectMembershipStream = knex.select("*").from(TableName.IdentityProjectMembership).stream();
  const chunkSize = 1000;
  let rows: TIdentityProjectMembershipRoleInsert[] = [];
  for await (const row of projectMembershipStream) {
    // disabling eslint just this part because the latest ts type doesn't have these values after migration as they are removed
    /* eslint-disable  */
    // @ts-ignore - created at is inserted from old data
    rows = rows.concat({
      // @ts-ignore - missing in ts type post migration
      role: row.role,
      // @ts-ignore - missing in ts type post migration
      customRoleId: row.roleId,
      projectMembershipId: row.id,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    });
    /* eslint-disable */
    if (rows.length >= chunkSize) {
      await knex(TableName.IdentityProjectMembershipRole).insert(rows);
      rows.splice(0, rows.length);
    }
  }
  if(rows.length) await knex(TableName.IdentityProjectMembershipRole).insert(rows);
  await knex.schema.alterTable(TableName.IdentityProjectMembership, (t) => {
    t.dropColumn("roleId");
    t.dropColumn("role");
  });
}

export async function down(knex: Knex): Promise<void> {
  const projectIdentityMembershipRoleStream = knex.select("*").from(TableName.IdentityProjectMembershipRole).stream();
  await knex.schema.alterTable(TableName.IdentityProjectMembership, (t) => {
    t.string("role");
    t.uuid("roleId");
    t.foreign("roleId").references("id").inTable(TableName.ProjectRoles);
  });
  for await (const row of projectIdentityMembershipRoleStream) {
    await knex(TableName.IdentityProjectMembership).where({ id: row.projectMembershipId }).update({
      // @ts-ignore - since the latest one doesn't have roleId anymore there will be type error here
      roleId: row.customRoleId,
      role: row.role
    });
  }
  await knex.schema.alterTable(TableName.IdentityProjectMembership, (t) => {
    t.string("role").notNullable().alter({ alterNullable: true });
  });

  await knex.schema.dropTableIfExists(TableName.IdentityProjectMembershipRole);
  await dropOnUpdateTrigger(knex, TableName.IdentityProjectMembershipRole);
}
