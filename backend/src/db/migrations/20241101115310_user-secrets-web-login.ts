import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable("user_secrets_web_login");
  if (tableExists) {
    await knex.schema.alterTable("user_secrets_web_login", (table) => {
      table.binary("password").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable("user_secrets_web_login");
  if (tableExists) {
    await knex.schema.alterTable("user_secrets_web_login", (table) => {
      table.dropColumn("password");
      table.string("password").nullable();
    });
  }
}
