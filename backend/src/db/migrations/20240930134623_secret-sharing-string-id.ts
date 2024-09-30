/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      // Add a new column
      t.string("new_id", 36).nullable();
    });

    // Copy data from old column to new column
    await knex(TableName.SecretSharing).update({
      // @ts-ignore
      new_id: knex.raw("id::text")
    });

    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      // Make the new column not nullable
      t.string("new_id", 36).notNullable().alter();

      // Drop the old primary key
      t.dropPrimary();

      // Drop the old id column
      t.dropColumn("id");

      // Rename the new column to 'id'
      t.renameColumn("new_id", "id");

      // Set the new column as primary key
      t.primary(["id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      // Add a new UUID column
      t.uuid("new_id").nullable();
    });

    // Copy data from string id to UUID, ensuring valid UUID format
    await knex(TableName.SecretSharing).update({
      // @ts-ignore
      new_id: knex.raw("id::uuid")
    });

    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      // Make the new column not nullable
      t.uuid("new_id").notNullable().alter();

      // Drop the old primary key
      t.dropPrimary();

      // Drop the old id column
      t.dropColumn("id");

      // Rename the new column to 'id'
      t.renameColumn("new_id", "id");

      // Set the new column as primary key
      t.primary(["id"]);

      // Set the id column to use a UUID default
      t.uuid("id").defaultTo(knex.raw("gen_random_uuid()")).notNullable().alter();
    });
  }
}
