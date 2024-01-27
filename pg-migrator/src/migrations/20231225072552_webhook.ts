import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Webhook))) {
    await knex.schema.createTable(TableName.Webhook, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("secretPath").notNullable().defaultTo("/");
      t.string("url").notNullable();
      t.string("lastStatus");
      t.text("lastRunErrorMessage");
      t.boolean("isDisabled").defaultTo(false).notNullable();
      // webhook signature
      t.text("encryptedSecretKey");
      t.text("iv");
      t.text("tag");
      t.string("algorithm");
      t.string("keyEncoding");
      t.timestamps(true, true, true);
      t.uuid("envId").notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
    });
  }
  await createOnUpdateTrigger(knex, TableName.Webhook);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.Webhook);
  await dropOnUpdateTrigger(knex, TableName.Webhook);
}
