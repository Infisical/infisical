import { Knex } from "knex";

import { TableName } from "../schemas";
import { OrgMembershipStatus } from "../schemas/models";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const isOrgRolePresent = await knex.schema.hasTable(TableName.OrgRoles);
  if (!isOrgRolePresent) {
    await knex.schema.createTable(TableName.OrgRoles, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.string("description");
      t.string("slug").notNullable();
      t.jsonb("permissions").notNullable();
      // does not need update trigger we will do it manually
      t.timestamps(true, true, true);
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
    });
  }

  const isOrgTablePresent = await knex.schema.hasTable(TableName.OrgMembership);
  if (!isOrgTablePresent) {
    await knex.schema.createTable(TableName.OrgMembership, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("role").notNullable();
      t.string("status").notNullable().defaultTo(OrgMembershipStatus.Invited);
      t.string("inviteEmail");
      // does not need update trigger we will do it manually
      t.timestamps(true, true, true);
      t.uuid("userId");
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.uuid("roleId");
      t.foreign("roleId").references("id").inTable(TableName.OrgRoles);
    });
  }
  // this is a one time function
  await createOnUpdateTrigger(knex, TableName.OrgMembership);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.OrgMembership);
  await knex.schema.dropTableIfExists(TableName.OrgRoles);
  await dropOnUpdateTrigger(knex, TableName.OrgMembership);
}
