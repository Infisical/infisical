import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ServiceToken))) {
    await knex.schema.createTable(TableName.ServiceToken, (t) => {
      t.string("id", 36).primary().defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.jsonb("scopes").notNullable();
      t.specificType("permissions", "text[]").notNullable();
      t.datetime("lastUsed");
      t.datetime("expiresAt");
      t.text("secretHash").notNullable();
      t.text("encryptedKey");
      t.text("iv");
      t.text("tag");
      t.timestamps(true, true, true);
      // user is old one
      t.string("createdBy").notNullable();
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
    });
  }
  await createOnUpdateTrigger(knex, TableName.ServiceToken);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ServiceToken);
  await dropOnUpdateTrigger(knex, TableName.ServiceToken);
}
