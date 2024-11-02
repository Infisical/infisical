import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const doesTableExist = await knex.schema.hasTable(TableName.UserSecrets);

  if (!doesTableExist) {
    await knex.schema.createTable(TableName.UserSecrets, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.text("name").notNullable();
      t.text("type").notNullable();
      t.text("ciphertext").notNullable();
      t.text("iv").notNullable();
      t.text("tag").notNullable();
      t.jsonb("extraData");
      t.uuid("orgId").notNullable().unique();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.uuid("userId").notNullable().unique();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
    });
  }

  await createOnUpdateTrigger(knex, TableName.UserSecrets);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.UserSecrets);
  await dropOnUpdateTrigger(knex, TableName.UserSecrets);
}
