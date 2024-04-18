import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PendingGroupAddition))) {
    await knex.schema.createTable(TableName.PendingGroupAddition, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.uuid("groupId").notNullable();
      t.foreign("groupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");
      t.unique(["userId", "groupId"]);
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.PendingGroupAddition);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.PendingGroupAddition);
  await dropOnUpdateTrigger(knex, TableName.PendingGroupAddition);
}
