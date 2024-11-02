import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable("user_secrets_web_login");
  if (tableExists) {
    const hasPassword = await knex.schema.hasColumn("user_secrets_web_login", "password");

    await knex.schema.alterTable("user_secrets_web_login", async (table) => {
      if (hasPassword) {
        await table.dropColumn("password");
        await table.binary("password").nullable();
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable("user_secrets_web_login");
  if (tableExists) {
    const hasPassword = await knex.schema.hasColumn("user_secrets_web_login", "password");

    await knex.schema.alterTable("user_secrets_web_login", (table) => {
      if (hasPassword) {
        table.dropColumn("password");
        table.string("password").nullable();
      }
    });
  }
}
