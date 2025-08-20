import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Bridge))) {
    await knex.schema.createTable(TableName.Bridge, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("baseUrl").notNullable();
      t.string("openApiUrl").notNullable();
      t.string("slug").notNullable();
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.jsonb("ruleSet").nullable();
      t.binary("encryptedHeaders").nullable();
      t.timestamps(true, true, true);
      t.unique(["slug", "projectId"]);
    });

    await createOnUpdateTrigger(knex, TableName.Bridge);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.Bridge);
  await knex.schema.dropTableIfExists(TableName.Bridge);
}
