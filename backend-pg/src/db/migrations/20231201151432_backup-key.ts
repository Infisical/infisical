import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const doesTableExist = await knex.schema.hasTable(TableName.BackupPrivateKey);
  if (!doesTableExist) {
    await knex.schema.createTable(TableName.BackupPrivateKey, (t) => {
      t.increments();
      t.string("encryptedPrivateKey").notNullable();
      t.string("iv").notNullable();
      t.string("tag").notNullable();
      t.string("algorithm").notNullable();
      t.string("keyEncoding").notNullable();
      t.string("salt").notNullable();
      t.string("verifier").notNullable();
      t.timestamps(true, true, true);
      t.uuid("userId").notNullable().unique();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.BackupPrivateKey);
}
