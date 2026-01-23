import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretRotationV2))) {
    await knex.schema.createTable(TableName.SecretRotationV2, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name", 32).notNullable();
      t.string("description");
      t.string("type").notNullable();
      t.jsonb("parameters").notNullable();
      t.jsonb("secretsMapping").notNullable();
      t.binary("encryptedGeneratedCredentials").notNullable();
      t.boolean("isAutoRotationEnabled").notNullable().defaultTo(true);
      t.integer("activeIndex").notNullable().defaultTo(0);
      t.uuid("folderId").notNullable();
      t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
      t.uuid("connectionId").notNullable();
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection);
      t.timestamps(true, true, true);
      t.integer("rotationInterval").notNullable();
      t.jsonb("rotateAtUtc").notNullable(); // { hours: number; minutes: number }
      t.string("rotationStatus").notNullable();
      t.datetime("lastRotationAttemptedAt").notNullable();
      t.datetime("lastRotatedAt").notNullable();
      t.binary("encryptedLastRotationMessage"); // we encrypt this because it may contain sensitive info (SQL errors showing credentials)
      t.string("lastRotationJobId");
      t.datetime("nextRotationAt");
      t.boolean("isLastRotationManual").notNullable().defaultTo(true); // creation is considered a "manual" rotation
    });

    await createOnUpdateTrigger(knex, TableName.SecretRotationV2);

    await knex.schema.alterTable(TableName.SecretRotationV2, (t) => {
      t.unique(["folderId", "name"]);
    });
  }

  if (!(await knex.schema.hasTable(TableName.SecretRotationV2SecretMapping))) {
    await knex.schema.createTable(TableName.SecretRotationV2SecretMapping, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("secretId").notNullable();
      // scott: this is deferred to block secret deletion but not prevent folder/environment/project deletion
      // ie, if rotation is being deleted as well we permit it, otherwise throw
      t.foreign("secretId").references("id").inTable(TableName.SecretV2).deferrable("deferred");
      t.uuid("rotationId").notNullable();
      t.foreign("rotationId").references("id").inTable(TableName.SecretRotationV2).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretRotationV2SecretMapping);
  await knex.schema.dropTableIfExists(TableName.SecretRotationV2);
  await dropOnUpdateTrigger(knex, TableName.SecretRotationV2);
}
