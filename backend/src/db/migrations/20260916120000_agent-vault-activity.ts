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

      // SET NULL rather than CASCADE: losing the connection must not silently drop the bucket
      // coordinates, or the sweep would lose the only handle on objects it still has to delete.
      t.uuid("appConnectionId");
      t.foreign("appConnectionId").references("id").inTable(TableName.AppConnection).onDelete("SET NULL");

      t.string("bucket", 255);
      t.string("region", 32);
      t.string("keyPrefix", 512);

      t.integer("configVersion").notNullable().defaultTo(1);

      t.bigint("storedRecordCount").notNullable().defaultTo(0);

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

      // Deliberately not a foreign key. proxyId is an input to the encryption AAD, so a SET NULL on
      // proxy deletion would make every chunk that proxy wrote permanently undecryptable. proxyName
      // is denormalised for the same reason.
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

      // Rows are immutable: createdAt only, no updatedAt and no trigger.
      t.timestamp("createdAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());

      // Scoped to the session rather than a global unique on a proxy-minted id, so a foreign proxy
      // cannot squat an id.
      t.unique(["sessionId", "chunkId"]);

      t.index(["sessionId", "startedAt"]);
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

  await knex.schema.dropTableIfExists(TableName.AgentVaultActivityChunk);

  await dropOnUpdateTrigger(knex, TableName.AgentVaultActivityConfig);
  await knex.schema.dropTableIfExists(TableName.AgentVaultActivityConfig);
}
