import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  // Base table for common fields
  if (!(await knex.schema.hasTable(TableName.UserSecret))) {
    await knex.schema.createTable(TableName.UserSecret, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.string("type").notNullable(); // webLogin, creditCard, secureNote
      t.specificType("tags", "text[]").nullable();
      t.string("folder").nullable();
      t.text("description").nullable();
      t.uuid("userId").notNullable();
      t.uuid("orgId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.UserSecret);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.UserSecret);
}
