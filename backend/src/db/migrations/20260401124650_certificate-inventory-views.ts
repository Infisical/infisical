import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.CertificateInventoryView))) {
    await knex.schema.createTable(TableName.CertificateInventoryView, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      t.string("name", 255).notNullable();
      t.jsonb("filters").notNullable().defaultTo("{}");
      t.jsonb("columns").nullable();

      t.uuid("createdByUserId").nullable();
      t.foreign("createdByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");

      t.timestamps(true, true, true);

      t.index(["projectId", "createdByUserId"]);
      t.unique(["projectId", "name", "createdByUserId"]);
    });

    await createOnUpdateTrigger(knex, TableName.CertificateInventoryView);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateInventoryView)) {
    await dropOnUpdateTrigger(knex, TableName.CertificateInventoryView);
    await knex.schema.dropTable(TableName.CertificateInventoryView);
  }
}
