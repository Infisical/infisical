import { Knex } from "knex";

import { TableName } from "../schemas";
import {
  createOnUpdateTrigger,
  createUpdateAtTriggerFunction,
  dropOnUpdateTrigger,
  dropUpdatedAtTriggerFunction
} from "../utils";

export async function up(knex: Knex): Promise<void> {
  const isTablePresent = await knex.schema.hasTable(TableName.Users);
  if (!isTablePresent) {
    await knex.schema.createTable(TableName.Users, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("email").unique().notNullable();
      t.specificType("authMethods", "text[]");
      t.boolean("superAdmin").defaultTo(false);
      t.string("firstName");
      t.string("lastName");
      t.boolean("isAccepted").defaultTo(false);
      t.boolean("isMfaEnabled").defaultTo(false);
      t.specificType("mfaMethods", "text[]");
      t.jsonb("devices");
      t.timestamps(true, true, true);
    });
  }
  // this is a one time function
  await createUpdateAtTriggerFunction(knex);
  await createOnUpdateTrigger(knex, TableName.Users);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.Users);
  await dropOnUpdateTrigger(knex, TableName.Users);
  await dropUpdatedAtTriggerFunction(knex);
}
