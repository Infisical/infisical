import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PamProjectRecordingConfig))) {
    await knex.schema.createTable(TableName.PamProjectRecordingConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable().unique(); // Unique ensures that there's only one config per project
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      t.string("storageBackend").notNullable(); // e.g. 'aws-s3' or 'postgres'

      t.uuid("connectionId").notNullable();
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection).onDelete("RESTRICT");

      t.string("bucket").notNullable();
      t.string("region").notNullable();
      t.string("keyPrefix").nullable();

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.PamProjectRecordingConfig);
  }

  if (!(await knex.schema.hasTable(TableName.PamSessionEventChunk))) {
    await knex.schema.createTable(TableName.PamSessionEventChunk, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("sessionId").notNullable();
      t.foreign("sessionId").references("id").inTable(TableName.PamSession).onDelete("CASCADE");
      t.index("sessionId");

      t.integer("chunkIndex").notNullable(); // Sequential starting from 0
      t.bigInteger("startElapsedMs").notNullable(); // Elapsed MS from start of session
      t.bigInteger("endElapsedMs").notNullable();

      t.string("storageBackend").notNullable(); // e.g. 'aws-s3' or 'postgres'

      // Postgres backend
      t.binary("encryptedEventsBlob").nullable();

      // External object storage backend
      t.string("externalChunkObjectKey", 1024).nullable();
      t.bigInteger("chunkSizeBytes").nullable();
      t.string("externalKeyframeObjectKey", 1024).nullable(); // RDP Only
      t.bigInteger("keyframeSizeBytes").nullable(); // RDP Only

      // Integrity
      t.binary("ciphertextSha256").notNullable();
      t.bigInteger("ciphertextBytes").notNullable();
      t.binary("iv").notNullable();

      t.timestamps(true, true, true);

      t.unique(["sessionId", "chunkIndex"]);
    });

    await createOnUpdateTrigger(knex, TableName.PamSessionEventChunk);
  }

  if (await knex.schema.hasTable(TableName.PamSession)) {
    const hasEncryptedKey = await knex.schema.hasColumn(TableName.PamSession, "encryptedSessionKey");
    const hasUploadTokenHash = await knex.schema.hasColumn(TableName.PamSession, "gatewayUploadTokenHash");

    await knex.schema.alterTable(TableName.PamSession, (t) => {
      if (!hasEncryptedKey) t.binary("encryptedSessionKey").nullable();
      if (!hasUploadTokenHash) t.binary("gatewayUploadTokenHash").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PamSession)) {
    const hasEncryptedKey = await knex.schema.hasColumn(TableName.PamSession, "encryptedSessionKey");
    const hasUploadTokenHash = await knex.schema.hasColumn(TableName.PamSession, "gatewayUploadTokenHash");

    await knex.schema.alterTable(TableName.PamSession, (t) => {
      if (hasEncryptedKey) t.dropColumn("encryptedSessionKey");
      if (hasUploadTokenHash) t.dropColumn("gatewayUploadTokenHash");
    });
  }

  await dropOnUpdateTrigger(knex, TableName.PamSessionEventChunk);
  await knex.schema.dropTableIfExists(TableName.PamSessionEventChunk);

  await dropOnUpdateTrigger(knex, TableName.PamProjectRecordingConfig);
  await knex.schema.dropTableIfExists(TableName.PamProjectRecordingConfig);
}
