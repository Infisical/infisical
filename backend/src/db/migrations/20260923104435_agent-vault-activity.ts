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

      t.bigint("storedChunkCount").notNullable().defaultTo(0);

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
      t.string("proxyName", 64).notNullable();

      t.timestamp("startedAt", { useTz: true }).notNullable();
      t.timestamp("endedAt", { useTz: true }).notNullable();

      t.bigint("firstSeq").notNullable();
      t.bigint("lastSeq").notNullable();

      t.integer("recordCount").notNullable();
      t.bigint("droppedCount").notNullable().defaultTo(0);

      t.string("bucket", 255).notNullable();

      t.string("objectKey", 1024).notNullable();
      t.integer("ciphertextBytes").notNullable();
      t.string("iv", 24).notNullable();
      t.string("ciphertextSha256", 43).notNullable();

      t.timestamps(true, true, true);

      t.unique(["sessionId", "chunkId"]);

      t.index(["sessionId", "createdAt"]);
      t.index(["projectId"]);
    });

    await createOnUpdateTrigger(knex, TableName.AgentVaultActivityChunk);
  }

  if (await knex.schema.hasTable(TableName.AgentVaultSession)) {
    const hasActivityKey = await knex.schema.hasColumn(TableName.AgentVaultSession, "encryptedActivityKey");
    if (!hasActivityKey) {
      await knex.schema.alterTable(TableName.AgentVaultSession, (t) => {
        t.binary("encryptedActivityKey");
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AgentVaultSession)) {
    const hasActivityKey = await knex.schema.hasColumn(TableName.AgentVaultSession, "encryptedActivityKey");
    if (hasActivityKey) {
      await knex.schema.alterTable(TableName.AgentVaultSession, (t) => {
        t.dropColumn("encryptedActivityKey");
      });
    }
  }

  await dropOnUpdateTrigger(knex, TableName.AgentVaultActivityChunk);
  await knex.schema.dropTableIfExists(TableName.AgentVaultActivityChunk);

  await dropOnUpdateTrigger(knex, TableName.AgentVaultActivityConfig);
  await knex.schema.dropTableIfExists(TableName.AgentVaultActivityConfig);
}
