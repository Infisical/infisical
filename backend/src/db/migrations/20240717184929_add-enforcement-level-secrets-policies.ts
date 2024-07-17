import { Knex } from "knex";

import { EnforcementLevel } from "@app/lib/types";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table("secret_approval_policies", (table) => {
    table.specificType("enforcementLevel", "VARCHAR(10)").notNullable().defaultTo(EnforcementLevel.Hard);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table("secret_approval_policies", (table) => {
    table.dropColumn("enforcementLevel");
  });
}
