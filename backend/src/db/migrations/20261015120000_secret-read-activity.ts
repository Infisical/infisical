import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretReadActivity))) {
    await knex.schema.createTable(TableName.SecretReadActivity, (t) => {
      // A folder or secret id. No foreign keys: each would need its own index, and rows of deleted
      // resources stop being updated, so the daily prune removes them anyway.
      t.uuid("objectId").notNullable();
      t.string("objectType", 32).notNullable();
      t.uuid("actorId").notNullable();
      t.string("actorType", 16).notNullable();
      // Left out of every index so that the daily update is a HOT update and never touches an index.
      t.datetime("lastReadAt", { useTz: true }).notNullable();
      // objectType is part of the key because one secret can be read both with and without its references
      // expanded, and the two credit different secrets.
      t.primary(["objectId", "actorId", "objectType"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretReadActivity);
}
