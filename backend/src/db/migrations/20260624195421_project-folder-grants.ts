import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ProjectFolderGrant))) {
    await knex.schema.createTable(TableName.ProjectFolderGrant, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("sourceProjectId").notNullable();
      t.foreign("sourceProjectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("sourceFolderId").notNullable();
      t.foreign("sourceFolderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
      t.string("targetProjectId").notNullable();
      t.foreign("targetProjectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.timestamps(true, true, true);

      t.index(["sourceProjectId"]);
      t.index(["sourceFolderId"]);
      t.index(["targetProjectId"]);
      t.unique(["sourceProjectId", "sourceFolderId", "targetProjectId"]);
    });

    await createOnUpdateTrigger(knex, TableName.ProjectFolderGrant);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.ProjectFolderGrant);
  await knex.schema.dropTableIfExists(TableName.ProjectFolderGrant);
}
