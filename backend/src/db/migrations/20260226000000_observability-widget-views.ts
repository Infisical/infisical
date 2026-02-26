import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ObservabilityWidgetView))) {
    await knex.schema.createTable(TableName.ObservabilityWidgetView, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name", 128).notNullable();

      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      // Full LayoutItem[] payload stored as JSONB
      t.jsonb("items").notNullable().defaultTo("[]");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.ObservabilityWidgetView);

    await knex.schema.alterTable(TableName.ObservabilityWidgetView, (t) => {
      t.index(["orgId", "userId"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ObservabilityWidgetView);
  await dropOnUpdateTrigger(knex, TableName.ObservabilityWidgetView);
}
