import { Knex } from "knex";
import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TableName.UserSecretSecureNote);
  if (tableExists) {
    await knex.schema.alterTable(TableName.UserSecretSecureNote, (t) => {
      t.dropForeign(["secretId"]);
    });
    await knex.schema.alterTable(TableName.UserSecretSecureNote, (t) => {
      t.foreign("secretId").references("id").inTable(TableName.UserSecret).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TableName.UserSecretSecureNote);
  if (tableExists) {
    await knex.schema.alterTable(TableName.UserSecretSecureNote, (t) => {
      t.dropForeign(["secretId"]);
      t.foreign("secretId").references("id").inTable(TableName.UserSecretSecureNote).onDelete("CASCADE");
    });
  }
}
