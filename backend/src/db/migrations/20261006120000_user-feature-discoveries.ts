import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.UserFeatureDiscovery))) {
    await knex.schema.createTable(TableName.UserFeatureDiscovery, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.string("releaseId", 255).notNullable();
      t.timestamps(true, true, true);

      t.unique(["userId", "releaseId"]);
    });

    await createOnUpdateTrigger(knex, TableName.UserFeatureDiscovery);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.UserFeatureDiscovery);
  await dropOnUpdateTrigger(knex, TableName.UserFeatureDiscovery);
}
