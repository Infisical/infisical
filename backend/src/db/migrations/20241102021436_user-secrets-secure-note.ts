import { Knex } from "knex";
import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TableName.UserSecretSecureNote);
  if (tableExists) {
    await knex.schema.alterTable(TableName.UserSecretSecureNote, (table) => {
      table.dropColumn("content");
    });

    await knex.schema.alterTable(TableName.UserSecretSecureNote, (table) => {
      table.binary("content").nullable();
    });

    await knex.schema.alterTable(TableName.UserSecretSecureNote, (table) => {
      table.binary("title").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TableName.UserSecretSecureNote);
  if (tableExists) {
    await knex.schema.alterTable(TableName.UserSecretSecureNote, (table) => {
      table.dropColumn("content");
      table.dropColumn("title");
    });
  }
}
