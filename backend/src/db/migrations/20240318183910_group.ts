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
      t.foreign("userId").references("id").inTable(TableName.Users);
      t.uuid("groupId").notNullable();
      t.foreign("groupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.UserGroupMembership);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.Groups);
  await dropOnUpdateTrigger(knex, TableName.Groups);

  await knex.schema.dropTableIfExists(TableName.UserGroupMembership);
  await dropOnUpdateTrigger(knex, TableName.UserGroupMembership);
}
