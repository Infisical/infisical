import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable("user_secrets_web_login");
  if (tableExists) {
    const hasIv = await knex.schema.hasColumn("user_secrets_web_login", "iv");
    const hasTag = await knex.schema.hasColumn("user_secrets_web_login", "tag");

    await knex.schema.alterTable("user_secrets_web_login", (table) => {
      if (hasIv) table.string("iv").nullable().alter();
      if (hasTag) table.string("tag").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable("user_secrets_web_login");
  if (tableExists) {
    const hasIv = await knex.schema.hasColumn("user_secrets_web_login", "iv");
    const hasTag = await knex.schema.hasColumn("user_secrets_web_login", "tag");

    await knex.schema.alterTable("user_secrets_web_login", (table) => {
      if (hasIv) table.string("iv").notNullable().alter();
      if (hasTag) table.string("tag").notNullable().alter();
    });
  }
}
