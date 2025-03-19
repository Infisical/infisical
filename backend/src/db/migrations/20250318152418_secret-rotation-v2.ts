import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretRotationV2))) {
    await knex.schema.createTable(TableName.SecretRotationV2, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name", 32).notNullable();
      t.string("description");
      t.string("type").notNullable();
      t.integer("interval").notNullable();
      t.jsonb("parameters").notNullable();
      t.binary("encryptedGeneratedCredentials").notNullable();
      t.boolean("isAutoRotationEnabled").notNullable().defaultTo(true);
      t.integer("activeIndex").notNullable().defaultTo(0);
      // we're including projectId in addition to folder ID because we allow folderId to be null (if the folder
      // is deleted), to preserve configuration
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("folderId");
      t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("SET NULL");
      t.uuid("connectionId").notNullable();
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection);
      t.timestamps(true, true, true);
      t.string("rotationStatus");
      t.string("lastRotationJobId");
      t.string("lastRotationMessage", 1024);
      t.datetime("lastRotatedAt");
    });

    await createOnUpdateTrigger(knex, TableName.SecretRotationV2);

    await knex.schema.alterTable(TableName.SecretRotationV2, (t) => {
      t.unique(["projectId", "name"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretRotationV2);
  await dropOnUpdateTrigger(knex, TableName.SecretRotationV2);
}
