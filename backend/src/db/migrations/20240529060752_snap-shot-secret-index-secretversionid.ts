import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const doesSecretVersionIdExist = await knex.schema.hasColumn(TableName.SnapshotSecret, "secretVersionId");
  if (await knex.schema.hasTable(TableName.SnapshotSecret)) {
    await knex.schema.alterTable(TableName.SnapshotSecret, (t) => {
      if (doesSecretVersionIdExist) t.index("secretVersionId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const doesSecretVersionIdExist = await knex.schema.hasColumn(TableName.SnapshotSecret, "secretVersionId");
  if (await knex.schema.hasTable(TableName.SnapshotSecret)) {
    await knex.schema.alterTable(TableName.SnapshotSecret, (t) => {
      if (doesSecretVersionIdExist) t.dropIndex("secretVersionId");
    });
  }
}
