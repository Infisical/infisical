import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable("user_secrets_secure_note");
  if (tableExists) {
    const hasIv = await knex.schema.hasColumn("user_secrets_secure_note", "iv");
    const hasTag = await knex.schema.hasColumn("user_secrets_secure_note", "tag");

    await knex.schema.alterTable("user_secrets_secure_note", (table) => {
      if (hasIv) table.string("iv").nullable().alter();
    });

    await knex.schema.alterTable("user_secrets_secure_note", (table) => {
      if (hasTag) table.string("tag").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable("user_secrets_secure_note");
  if (tableExists) {
    const hasIv = await knex.schema.hasColumn("user_secrets_secure_note", "iv");
    const hasTag = await knex.schema.hasColumn("user_secrets_secure_note", "tag");
    await knex.schema.alterTable("user_secrets_secure_note", (table) => {
      if (hasIv) table.string("iv").notNullable().alter();
    });

    await knex.schema.alterTable("user_secrets_secure_note", (table) => {
      if (hasTag) table.string("tag").notNullable().alter();
    });
  }
}
