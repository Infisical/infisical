import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.UserSecrets))) {
    await knex.schema.createTable(TableName.UserSecrets, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("userId").notNullable();
      t.uuid("orgId").notNullable();
      t.text("secretType").notNullable();
      t.string("name").notNullable();
      t.text("loginURL").nullable();
      t.binary("username").nullable();
      t.binary("password").nullable();
      t.boolean("isUsernameSecret").defaultTo(false);
      t.binary("cardNumber").nullable();
      t.text("cardLastFourDigits").nullable();
      t.binary("cardExpiry").nullable();
      t.binary("cardCvv").nullable();
      t.binary("secureNote").nullable();
      t.text("iv").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.UserSecrets);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.UserSecrets);
}
