import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AgentVaultSessionStats))) {
    await knex.schema.createTable(TableName.AgentVaultSessionStats, (t) => {
      t.uuid("sessionId").primary();
      t.foreign("sessionId").references("id").inTable(TableName.AgentVaultSession).onDelete("CASCADE");

      t.bigint("requests").notNullable().defaultTo(0);
      // Null once any chunk arrived without the per-decision split, which CLIs before 0.45.5 don't send.
      t.bigint("brokered");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.AgentVaultSessionStats);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.AgentVaultSessionStats);
  await knex.schema.dropTableIfExists(TableName.AgentVaultSessionStats);
}
