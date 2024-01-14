import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ProjectBot))) {
    await knex.schema.createTable(TableName.ProjectBot, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.boolean("isActive").defaultTo(false).notNullable();
      t.text("encryptedPrivateKey").notNullable();
      t.text("publicKey").notNullable();
      t.text("iv").notNullable();
      t.text("tag").notNullable();
      t.string("algorithm").notNullable();
      t.string("keyEncoding").notNullable();
      t.text("encryptedProjectKey");
      t.text("encryptedProjectKeyNonce");
      // one to one relationship
      t.string("projectId").notNullable().unique();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("senderId");
      t.foreign("senderId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.ProjectBot);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ProjectBot);
  await dropOnUpdateTrigger(knex, TableName.ProjectBot);
}
