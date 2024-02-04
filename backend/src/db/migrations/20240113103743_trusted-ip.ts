import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.TrustedIps))) {
    await knex.schema.createTable(TableName.TrustedIps, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("ipAddress").notNullable();
      t.string("type").notNullable();
      t.integer("prefix");
      t.boolean("isActive").defaultTo(true);
      t.string("comment");
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.TrustedIps);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.TrustedIps);
  await dropOnUpdateTrigger(knex, TableName.TrustedIps);
}
