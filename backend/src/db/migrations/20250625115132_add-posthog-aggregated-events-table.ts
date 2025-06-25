import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PosthogAggregatedEvents))) {
    await knex.schema.createTable(TableName.PosthogAggregatedEvents, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("distinctId").notNullable();
      t.string("event").notNullable();
      t.bigInteger("eventCount").defaultTo(0).notNullable();
      t.jsonb("properties").notNullable();
      t.string("batchId").notNullable();
      t.string("organizationId").nullable();
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.PosthogAggregatedEvents);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.PosthogAggregatedEvents);
  await dropOnUpdateTrigger(knex, TableName.PosthogAggregatedEvents);
}
