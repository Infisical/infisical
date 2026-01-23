import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ProjectTemplates))) {
    await knex.schema.createTable(TableName.ProjectTemplates, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name", 32).notNullable();
      t.string("description").nullable();
      t.jsonb("roles").notNullable();
      t.jsonb("environments").notNullable();
      t.uuid("orgId").notNullable().references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.ProjectTemplates);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.ProjectTemplates)) {
    await dropOnUpdateTrigger(knex, TableName.ProjectTemplates);

    await knex.schema.dropTable(TableName.ProjectTemplates);
  }
}
