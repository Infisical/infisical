import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const doesSnapshotIdExist = await knex.schema.hasColumn(TableName.SnapshotFolder, "snapshotId");
  if (await knex.schema.hasTable(TableName.SnapshotFolder)) {
    await knex.schema.alterTable(TableName.SnapshotFolder, (t) => {
      if (doesSnapshotIdExist) t.index("snapshotId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const doesSnapshotIdExist = await knex.schema.hasColumn(TableName.SnapshotFolder, "snapshotId");
  if (await knex.schema.hasTable(TableName.SnapshotFolder)) {
    await knex.schema.alterTable(TableName.SnapshotFolder, (t) => {
      if (doesSnapshotIdExist) t.dropIndex("snapshotId");
    });
  }
}
