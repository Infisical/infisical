import { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
    const hasIV = await knex.schema.hasColumn("consumer_secrets", "encryption_iv");
    const hasTag = await knex.schema.hasColumn("consumer_secrets", "encryption_tag");

    if (!hasIV) {
        await knex.schema.alterTable("consumer_secrets", (table) => {
            table.string('encryption_iv', 256).notNullable();
        });
    }

    if (!hasTag) {
        await knex.schema.alterTable("consumer_secrets", (table) => {
            table.string('encryption_tag', 256).notNullable();
        });
    }
}


export async function down(knex: Knex): Promise<void> {
    const hasIV = await knex.schema.hasColumn("consumer_secrets", "encryption_iv");
    const hasTag = await knex.schema.hasColumn("consumer_secrets", "encryption_tag");

    if (hasIV) {
        await knex.schema.alterTable("consumer_secrets", (table) => {
            table.dropColumn("encryption_iv");
        });

    }

    if (hasTag) {
        await knex.schema.alterTable("consumer_secrets", (table) => {
            table.dropColumn("encryption_tag");
        });
    }
}
