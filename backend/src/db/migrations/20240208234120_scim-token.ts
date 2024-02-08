import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ScimToken))) {
    await knex.schema.createTable(TableName.ScimToken, (t) => {
      t.string("id", 36).primary().defaultTo(knex.fn.uuid());
      t.bigInteger("tokenTTL").defaultTo(15552000).notNullable(); // 180 days second
      t.datetime("tokenLastUsedAt");
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.IdentityAccessToken);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ScimToken);
  await dropOnUpdateTrigger(knex, TableName.ScimToken);
}
