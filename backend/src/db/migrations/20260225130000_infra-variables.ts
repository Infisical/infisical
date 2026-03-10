import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.InfraVariable))) {
    await knex.schema.createTable(TableName.InfraVariable, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("key").notNullable();
      t.text("value").notNullable().defaultTo("");
      t.boolean("sensitive").notNullable().defaultTo(false);
      t.timestamps(true, true, true);
      t.unique(["projectId", "key"]);
    });
    await createOnUpdateTrigger(knex, TableName.InfraVariable);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.InfraVariable);
}
