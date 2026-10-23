import { Knex } from "knex";

import { TableName } from "../schemas";

// Alerts created by the platform (data migrations, background jobs) have no actor id. The actor type
// stays required so every row still says who or what created it.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Alert, "createdByActorId")) {
    await knex.schema.alterTable(TableName.Alert, (t) => {
      t.uuid("createdByActorId").nullable().alter();
    });
  }

  if (await knex.schema.hasColumn(TableName.AlertChannel, "createdByActorId")) {
    await knex.schema.alterTable(TableName.AlertChannel, (t) => {
      t.uuid("createdByActorId").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Rows without an actor id cannot satisfy NOT NULL, and inventing an id would misattribute them.
  await knex(TableName.Alert).whereNull("createdByActorId").delete();
  await knex(TableName.AlertChannel).whereNull("createdByActorId").delete();

  await knex.schema.alterTable(TableName.Alert, (t) => {
    t.uuid("createdByActorId").notNullable().alter();
  });
  await knex.schema.alterTable(TableName.AlertChannel, (t) => {
    t.uuid("createdByActorId").notNullable().alter();
  });
}
