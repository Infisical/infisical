import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasIsStale = await knex.schema.hasColumn(TableName.PamDiscoveredAccount, "isStale");
  const hasLastDiscoveredAt = await knex.schema.hasColumn(TableName.PamDiscoveredAccount, "lastDiscoveredAt");

  if (!hasIsStale || !hasLastDiscoveredAt) {
    await knex.schema.alterTable(TableName.PamDiscoveredAccount, (t) => {
      if (!hasIsStale) t.boolean("isStale").notNullable().defaultTo(false);
      if (!hasLastDiscoveredAt) t.timestamp("lastDiscoveredAt");
    });

    if (!hasLastDiscoveredAt) {
      await knex(TableName.PamDiscoveredAccount).update("lastDiscoveredAt", knex.ref("updatedAt"));
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasIsStale = await knex.schema.hasColumn(TableName.PamDiscoveredAccount, "isStale");
  const hasLastDiscoveredAt = await knex.schema.hasColumn(TableName.PamDiscoveredAccount, "lastDiscoveredAt");

  if (hasIsStale || hasLastDiscoveredAt) {
    await knex.schema.alterTable(TableName.PamDiscoveredAccount, (t) => {
      if (hasIsStale) t.dropColumn("isStale");
      if (hasLastDiscoveredAt) t.dropColumn("lastDiscoveredAt");
    });
  }
}
