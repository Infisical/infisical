import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const doesEnvIdExist = await knex.schema.hasColumn(TableName.SnapshotSecret, "envId");
  if (await knex.schema.hasTable(TableName.SnapshotSecret)) {
    await knex.schema.alterTable(TableName.SnapshotSecret, (t) => {
      if (doesEnvIdExist) t.index("envId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const doesEnvIdExist = await knex.schema.hasColumn(TableName.SnapshotSecret, "envId");

  if (await knex.schema.hasTable(TableName.SnapshotSecret)) {
    await knex.schema.alterTable(TableName.SnapshotSecret, (t) => {
      if (doesEnvIdExist) t.dropIndex("envId");
    });
  }
}
