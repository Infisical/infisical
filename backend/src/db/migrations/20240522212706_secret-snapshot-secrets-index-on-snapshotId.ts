import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const doesSnapshotIdExist = await knex.schema.hasColumn(TableName.SnapshotSecret, "snapshotId");
  if (await knex.schema.hasTable(TableName.SnapshotSecret)) {
    await knex.schema.alterTable(TableName.SnapshotSecret, (t) => {
      if (doesSnapshotIdExist) t.index("snapshotId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const doesSnapshotIdExist = await knex.schema.hasColumn(TableName.SnapshotSecret, "snapshotId");
  if (await knex.schema.hasTable(TableName.SnapshotSecret)) {
    await knex.schema.alterTable(TableName.SnapshotSecret, (t) => {
      if (doesSnapshotIdExist) t.dropIndex("snapshotId");
    });
  }
}
