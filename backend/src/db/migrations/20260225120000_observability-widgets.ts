import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ObservabilityWidget))) {
    await knex.schema.createTable(TableName.ObservabilityWidget, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name", 128).notNullable();
      t.string("description", 512);

      // Scope
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.string("projectId");
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      // Widget type discriminator: "events", "metrics", "logs", "pie-chart", etc.
      t.string("type", 32).notNullable();

      // Type-specific configuration (JSONB for flexibility)
      t.jsonb("config").notNullable();

      // Refresh configuration (in seconds)
      t.integer("refreshInterval").notNullable().defaultTo(30);

      // Widget appearance
      t.string("icon", 64);
      t.string("color", 32);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.ObservabilityWidget);

    // Indexes for common queries
    await knex.schema.alterTable(TableName.ObservabilityWidget, (t) => {
      t.index("orgId");
      t.index("projectId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ObservabilityWidget);
  await dropOnUpdateTrigger(knex, TableName.ObservabilityWidget);
}
