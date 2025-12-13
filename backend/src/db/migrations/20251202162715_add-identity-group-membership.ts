import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.IdentityGroupMembership))) {
    await knex.schema.createTable(TableName.IdentityGroupMembership, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("identityId").notNullable();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
      t.uuid("groupId").notNullable();
      t.foreign("groupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");
      t.timestamps(true, true, true);

      t.unique(["identityId", "groupId"]);
    });
  }

  await createOnUpdateTrigger(knex, TableName.IdentityGroupMembership);
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.IdentityGroupMembership)) {
    await knex.schema.dropTable(TableName.IdentityGroupMembership);
    await dropOnUpdateTrigger(knex, TableName.IdentityGroupMembership);
  }
}
