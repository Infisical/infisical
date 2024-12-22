import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.UserSecrets))) {
    await knex.schema.createTable(TableName.UserSecrets, (table) => {
      // Primary key
      table.uuid("id").primary().defaultTo(knex.fn.uuid());
      // Foreign keys
      table.uuid("organization_id").notNullable().references("id").inTable(TableName.Organization).onDelete("CASCADE");

      table.uuid("created_by").notNullable().references("id").inTable(TableName.Users).onDelete("CASCADE");

      // Data fields
      table.string("name", 255).notNullable();
      table.enum("type", ["WEB_LOGIN", "CREDIT_CARD", "SECURE_NOTE"]).notNullable();

      // Encryption fields (using text instead of binary)
      table.text("encrypted_data").notNullable();
      table.text("iv").notNullable();
      table.text("tag").notNullable();
      table.string("key_encoding", 20).notNullable();
      table.string("algorithm", 20).notNullable();

      // Timestamps
      table.timestamps(true, true, true);

      // Indexes
      table.index(["organization_id"]);
      table.index(["created_by"]);
    });
  }

  await createOnUpdateTrigger(knex, TableName.UserSecrets);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.UserSecrets);
  await dropOnUpdateTrigger(knex, TableName.UserSecrets);
}
