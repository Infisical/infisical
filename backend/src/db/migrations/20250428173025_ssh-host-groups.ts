import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SshHostGroup))) {
    await knex.schema.createTable(TableName.SshHostGroup, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("name").notNullable();
      t.unique(["projectId", "name"]);
    });
    await createOnUpdateTrigger(knex, TableName.SshHostGroup);
  }

  if (!(await knex.schema.hasTable(TableName.SshHostGroupMembership))) {
    await knex.schema.createTable(TableName.SshHostGroupMembership, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("sshHostGroupId").notNullable();
      t.foreign("sshHostGroupId").references("id").inTable(TableName.SshHostGroup).onDelete("CASCADE");
      t.uuid("sshHostId").notNullable();
      t.foreign("sshHostId").references("id").inTable(TableName.SshHost).onDelete("CASCADE");
      t.unique(["sshHostGroupId", "sshHostId"]);
    });
    await createOnUpdateTrigger(knex, TableName.SshHostGroupMembership);
  }

  const hasGroupColumn = await knex.schema.hasColumn(TableName.SshHostLoginUser, "sshHostGroupId");
  if (!hasGroupColumn) {
    await knex.schema.alterTable(TableName.SshHostLoginUser, (t) => {
      t.uuid("sshHostGroupId").nullable();
      t.foreign("sshHostGroupId").references("id").inTable(TableName.SshHostGroup).onDelete("CASCADE");
      t.uuid("sshHostId").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasGroupColumn = await knex.schema.hasColumn(TableName.SshHostLoginUser, "sshHostGroupId");
  if (hasGroupColumn) {
    await knex.schema.alterTable(TableName.SshHostLoginUser, (t) => {
      t.dropColumn("sshHostGroupId");
    });
  }

  await knex.schema.dropTableIfExists(TableName.SshHostGroupMembership);
  await dropOnUpdateTrigger(knex, TableName.SshHostGroupMembership);

  await knex.schema.dropTableIfExists(TableName.SshHostGroup);
  await dropOnUpdateTrigger(knex, TableName.SshHostGroup);
}
