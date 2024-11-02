import { Knex } from "knex";
import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // check for table existence
  const tableExists = await knex.schema.hasTable(TableName.UserSecretCreditCard);
  if (tableExists) {
    await knex.schema.alterTable(TableName.UserSecretCreditCard, (table) => {
      table.dropColumn("cvv");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TableName.UserSecretCreditCard);
  if (tableExists) {
    await knex.schema.alterTable(TableName.UserSecretCreditCard, (table) => {
      table.dropColumn("cvv");
    });
  }
}
