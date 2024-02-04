import { Knex } from "knex";
import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TableName.Organization, (t) => {
        t.boolean("authEnabled").defaultTo(false);
    });

    await knex(TableName.Organization)
        .whereIn(
        "id",
        knex(TableName.SamlConfig)
            .select("orgId")
            .where("isActive", true)
        )
        .update({ authEnabled: true });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.dropColumn("authEnabled");
    });
}

