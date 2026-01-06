import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ScimEvents))) {
    const createTableSql = knex.schema
      .createTable(TableName.ScimEvents, (t) => {
        t.uuid("id").defaultTo(knex.fn.uuid());
        t.uuid("orgId").notNullable();
        t.string("eventType");
        t.jsonb("event");

        t.timestamps(true, true, true);
        t.primary(["id", "createdAt"]);
      })
      .toString();

    await knex.schema.raw(`
        ${createTableSql} PARTITION BY RANGE ("createdAt");
    `);

    await knex.schema.raw(`CREATE TABLE ${TableName.ScimEvents}_default PARTITION OF ${TableName.ScimEvents} DEFAULT`);

    await knex.schema.alterTable(TableName.ScimEvents, (t) => {
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.index(["orgId", "eventType"]);
    });

    await createOnUpdateTrigger(knex, TableName.ScimEvents);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ScimEvents);
  await dropOnUpdateTrigger(knex, TableName.ScimEvents);
}
