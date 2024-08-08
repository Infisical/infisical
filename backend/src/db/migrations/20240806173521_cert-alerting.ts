import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PkiCollection))) {
    await knex.schema.createTable(TableName.PkiCollection, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("name").notNullable();
    });
  }

  if (!(await knex.schema.hasTable(TableName.Alert))) {
    // TODO: rename to pki alert
    await knex.schema.createTable(TableName.Alert, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("pkiCollectionId").notNullable();
      t.foreign("pkiCollectionId").references("id").inTable(TableName.PkiCollection).onDelete("CASCADE");
      t.string("name").notNullable();
      t.integer("alertBeforeDays").notNullable();
      t.string("recipientEmails").notNullable();
    });
  }

  await createOnUpdateTrigger(knex, TableName.PkiCollection);
  await createOnUpdateTrigger(knex, TableName.Alert);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.PkiCollection);
  await dropOnUpdateTrigger(knex, TableName.PkiCollection);

  await knex.schema.dropTableIfExists(TableName.Alert);
  await dropOnUpdateTrigger(knex, TableName.Alert);
}
