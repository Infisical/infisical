import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.UserSecretActivation))) {
    await knex.schema.createTable(TableName.UserSecretActivation, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.datetime("firstSecretCreatedAt");
      t.datetime("returnedAfterThreeDaysAt");
      t.datetime("returnedAfterSevenDaysAt");
      t.datetime("createdAt").notNullable().defaultTo(knex.fn.now());
      t.datetime("updatedAt").notNullable().defaultTo(knex.fn.now());

      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.unique(["userId", "orgId"]);
      t.index(["orgId"]);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.UserSecretActivation);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.UserSecretActivation);
  await knex.schema.dropTableIfExists(TableName.UserSecretActivation);
}
