import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export async function up(knex: Knex): Promise<void> {
  await knex(TableName.ObservabilityWidget)
    .where({ name: "Expiring Certificates", isBuiltIn: true })
    .update({ icon: "Clock" });
}

export async function down(knex: Knex): Promise<void> {
  await knex(TableName.ObservabilityWidget)
    .where({ name: "Expiring Certificates", isBuiltIn: true })
    .update({ icon: "Activity" });
}
