import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.PamDiscoverySourceRun, "machineErrors"))) {
    await knex.schema.alterTable(TableName.PamDiscoverySourceRun, (t) => {
      t.jsonb("machineErrors");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PamDiscoverySourceRun, "machineErrors")) {
    await knex.schema.alterTable(TableName.PamDiscoverySourceRun, (t) => {
      t.dropColumn("machineErrors");
    });
  }
}
