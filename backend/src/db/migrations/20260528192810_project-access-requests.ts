import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ProjectAccessRequest))) {
    await knex.schema.createTable(TableName.ProjectAccessRequest, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("requesterUserId").notNullable();
      t.foreign("requesterUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.string("status").notNullable().defaultTo("pending");
      t.text("comment").nullable();
      t.timestamps(true, true, true);
      t.unique(["projectId", "requesterUserId"]);
      t.index(["requesterUserId"]);
    });

    await createOnUpdateTrigger(knex, TableName.ProjectAccessRequest);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ProjectAccessRequest);
  await dropOnUpdateTrigger(knex, TableName.ProjectAccessRequest);
}
