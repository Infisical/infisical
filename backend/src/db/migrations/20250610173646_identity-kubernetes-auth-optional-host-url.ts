import { Knex } from "knex";

import { selectAllTableCols } from "@app/lib/knex";

import { TableName } from "../schemas";

const BATCH_SIZE = 1000;

export async function up(knex: Knex): Promise<void> {
  const hasKubernetesHostColumn = await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "kubernetesHost");

  if (hasKubernetesHostColumn) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (table) => {
      table.string("kubernetesHost").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasKubernetesHostColumn = await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "kubernetesHost");

  // find all rows where kubernetesHost is null
  const rows = await knex(TableName.IdentityKubernetesAuth)
    .whereNull("kubernetesHost")
    .select(selectAllTableCols(TableName.IdentityKubernetesAuth));

  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      // eslint-disable-next-line no-await-in-loop
      await knex(TableName.IdentityKubernetesAuth)
        .whereIn(
          "id",
          batch.map((row) => row.id)
        )
        .update({ kubernetesHost: "" });
    }
  }

  if (hasKubernetesHostColumn) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (table) => {
      table.string("kubernetesHost").notNullable().alter();
    });
  }
}
