import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AgentVaultActivityConfig))) {
    await knex.schema.createTable(TableName.AgentVaultActivityConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId", 36).notNullable().unique();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      t.boolean("enabled").notNullable().defaultTo(false);

      t.uuid("appConnectionId");
      t.foreign("appConnectionId").references("id").inTable(TableName.AppConnection).deferrable("deferred");
      t.index(["appConnectionId"]);

      t.string("bucket", 255);
      t.string("region", 32);
      t.string("keyPrefix", 512);

      t.integer("configVersion").notNullable().defaultTo(1);

      t.bigint("storedChunkCount").notNullable().defaultTo(0);
      t.timestamp("destinationChangedAt", { useTz: true });

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.AgentVaultActivityConfig);
  }

  if (!(await knex.schema.hasTable(TableName.AgentVaultActivityChunk))) {
    await knex.schema.createTable(TableName.AgentVaultActivityChunk, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("chunkId", 26).notNullable();

      t.uuid("sessionId").notNullable();
      t.foreign("sessionId").references("id").inTable(TableName.AgentVaultSession).onDelete("CASCADE");

      t.string("projectId", 36).notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      // Deliberately not a foreign key: proxyId is part of the encryption AAD, so a SET NULL on proxy
      // deletion would make every chunk that proxy wrote undecryptable.
      t.string("proxyId", 36).notNullable();
      t.string("proxyName", 64);

      t.timestamp("startedAt", { useTz: true }).notNullable();
      t.timestamp("endedAt", { useTz: true }).notNullable();

      t.bigint("firstSeq").notNullable();
      t.bigint("lastSeq").notNullable();

      t.integer("recordCount").notNullable();
      t.bigint("droppedCount").notNullable().defaultTo(0);

      t.integer("configVersion").notNullable();

      t.string("objectKey", 1024).notNullable();
      t.integer("ciphertextBytes").notNullable();
      t.string("iv", 24).notNullable();

      // Millisecond precision: createdAt is a cursor that round-trips through a JS Date, which drops microseconds.
      t.timestamp("createdAt", { useTz: true, precision: 3 }).notNullable().defaultTo(knex.fn.now());

      t.unique(["sessionId", "chunkId"]);

      t.index(["sessionId", "startedAt"]);
      t.index(["sessionId", "createdAt"]);
      t.index(["projectId"]);
    });
  }

  if (await knex.schema.hasTable(TableName.AgentVaultSession)) {
    const hasActivityKey = await knex.schema.hasColumn(TableName.AgentVaultSession, "encryptedActivityKey");
    if (!hasActivityKey) {
      await knex.schema.alterTable(TableName.AgentVaultSession, (t) => {
        t.binary("encryptedActivityKey");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.AgentVaultProxy)) {
    const hasUploadedAt = await knex.schema.hasColumn(TableName.AgentVaultProxy, "activityUploadedAt");
    if (!hasUploadedAt) {
      await knex.schema.alterTable(TableName.AgentVaultProxy, (t) => {
        t.timestamp("activityUploadedAt", { useTz: true });
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AgentVaultProxy)) {
    const hasUploadedAt = await knex.schema.hasColumn(TableName.AgentVaultProxy, "activityUploadedAt");
    if (hasUploadedAt) {
      await knex.schema.alterTable(TableName.AgentVaultProxy, (t) => {
        t.dropColumn("activityUploadedAt");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.AgentVaultSession)) {
    const hasActivityKey = await knex.schema.hasColumn(TableName.AgentVaultSession, "encryptedActivityKey");
    if (hasActivityKey) {
      await knex.schema.alterTable(TableName.AgentVaultSession, (t) => {
        t.dropColumn("encryptedActivityKey");
      });
    }
  }

  await knex.schema.dropTableIfExists(TableName.AgentVaultActivityChunk);

  await dropOnUpdateTrigger(knex, TableName.AgentVaultActivityConfig);
  await knex.schema.dropTableIfExists(TableName.AgentVaultActivityConfig);
}
