import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PamAccountPolicy))) {
    await knex.schema.createTable(TableName.PamAccountPolicy, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      t.string("name").notNullable();
      t.text("description").nullable();
      t.jsonb("rules").notNullable();
      t.boolean("isActive").notNullable().defaultTo(true);

      t.unique(["projectId", "name"]);

      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.PamAccountPolicy);

  if (await knex.schema.hasTable(TableName.PamAccount)) {
    const hasColumn = await knex.schema.hasColumn(TableName.PamAccount, "policyId");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.PamAccount, (t) => {
        t.uuid("policyId").nullable();
        t.foreign("policyId").references("id").inTable(TableName.PamAccountPolicy).onDelete("SET NULL");
        t.index("policyId");
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PamAccount)) {
    const hasColumn = await knex.schema.hasColumn(TableName.PamAccount, "policyId");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.PamAccount, (t) => {
        t.dropColumn("policyId");
      });
    }
  }

  await knex.schema.dropTableIfExists(TableName.PamAccountPolicy);
  await dropOnUpdateTrigger(knex, TableName.PamAccountPolicy);
}
