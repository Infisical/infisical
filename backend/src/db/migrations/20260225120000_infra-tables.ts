import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  // InfraFile — .tf files stored per project
  if (!(await knex.schema.hasTable(TableName.InfraFile))) {
    await knex.schema.createTable(TableName.InfraFile, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("name").notNullable();
      t.text("content").notNullable().defaultTo("");
      t.timestamps(true, true, true);
      t.unique(["projectId", "name"]);
    });
    await createOnUpdateTrigger(knex, TableName.InfraFile);
  }

  // InfraState — OpenTofu state blob per project (no lock — concurrency is service-level)
  if (!(await knex.schema.hasTable(TableName.InfraState))) {
    await knex.schema.createTable(TableName.InfraState, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable().unique();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.jsonb("content").notNullable();
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.InfraState);
  }

  // InfraRun — execution history
  if (!(await knex.schema.hasTable(TableName.InfraRun))) {
    await knex.schema.createTable(TableName.InfraRun, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("type").notNullable(); // 'plan' | 'apply'
      t.string("status").notNullable().defaultTo("pending"); // pending, running, success, failed, awaiting_approval
      t.text("logs").notNullable().defaultTo("");
      t.jsonb("planJson").nullable(); // parsed resource_changes from tofu show -json
      t.text("aiSummary").nullable(); // structured AiInsight JSON string
      t.jsonb("fileSnapshot").nullable(); // {name: content} map at run time
      t.uuid("triggeredBy").nullable();
      t.foreign("triggeredBy").references("id").inTable(TableName.Users).onDelete("SET NULL");
      t.uuid("planRunId").nullable(); // links apply to its preceding plan
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.InfraRun);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.InfraRun);
  await knex.schema.dropTableIfExists(TableName.InfraState);
  await knex.schema.dropTableIfExists(TableName.InfraFile);
}
