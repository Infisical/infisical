import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  // Add isAutoRotationEnabled to app_connections
  if (!(await knex.schema.hasColumn(TableName.AppConnection, "isAutoRotationEnabled"))) {
    await knex.schema.alterTable(TableName.AppConnection, (t) => {
      t.boolean("isAutoRotationEnabled").defaultTo(false).notNullable();
    });
  }

  if (!(await knex.schema.hasTable(TableName.AppConnectionCredentialRotation))) {
    await knex.schema.createTable(TableName.AppConnectionCredentialRotation, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("connectionId").notNullable().unique();
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection).onDelete("CASCADE");
      t.string("strategy").notNullable();
      t.binary("encryptedStrategyConfig").notNullable();
      t.integer("rotationInterval").notNullable();
      t.jsonb("rotateAtUtc").notNullable();
      t.string("rotationStatus").notNullable();
      t.timestamp("lastRotationAttemptedAt").nullable();
      t.timestamp("lastRotatedAt").nullable();
      t.binary("encryptedLastRotationMessage").nullable();
      t.string("lastRotationJobId").nullable();
      t.timestamp("nextRotationAt").nullable();
      t.integer("activeIndex").notNullable().defaultTo(0);
      t.binary("encryptedGeneratedCredentials").notNullable();
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.AppConnectionCredentialRotation);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.AppConnectionCredentialRotation);
  await dropOnUpdateTrigger(knex, TableName.AppConnectionCredentialRotation);

  if (await knex.schema.hasColumn(TableName.AppConnection, "isAutoRotationEnabled")) {
    await knex.schema.alterTable(TableName.AppConnection, (t) => {
      t.dropColumn("isAutoRotationEnabled");
    });
  }
}
