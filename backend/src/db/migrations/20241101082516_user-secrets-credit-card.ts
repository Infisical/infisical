import { Knex } from "knex";
import { TableName } from "../schemas";
import { createOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.UserSecretCreditCard))) {
    await knex.schema.createTable(TableName.UserSecretCreditCard, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.text("cardNumber").notNullable();
      t.text("cardholderName").notNullable();
      t.text("expiryDate").notNullable();
      t.text("cvv").notNullable();
      t.text("brand").nullable();
      t.text("iv").notNullable();
      t.text("tag").notNullable();
      t.uuid("secretId").notNullable();
      t.foreign("secretId").references("id").inTable(TableName.UserSecret).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.UserSecretCreditCard);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.UserSecretCreditCard);
}
