import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const isTablePresent = await knex.schema.hasTable(TableName.IncidentContact);
  if (!isTablePresent) {
    await knex.schema.createTable(TableName.IncidentContact, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("email").notNullable();
      // does not need update trigger we will do it manually
      t.timestamps(true, true, true);
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
    });
  }
  // this is a one time function
  await createOnUpdateTrigger(knex, TableName.IncidentContact);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.IncidentContact);
  await dropOnUpdateTrigger(knex, TableName.IncidentContact);
}
