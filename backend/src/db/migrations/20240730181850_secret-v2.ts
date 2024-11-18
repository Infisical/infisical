/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Knex } from "knex";

import { SecretType, TableName } from "../schemas";
import { createJunctionTable, createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const doesSecretV2TableExist = await knex.schema.hasTable(TableName.SecretV2);
  if (!doesSecretV2TableExist) {
    await knex.schema.createTable(TableName.SecretV2, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.integer("version").defaultTo(1).notNullable();
      t.string("type").notNullable().defaultTo(SecretType.Shared);
      t.string("key", 500).notNullable();
      t.binary("encryptedValue");
      t.binary("encryptedComment");
      t.string("reminderNote");
      t.integer("reminderRepeatDays");
      t.boolean("skipMultilineEncoding").defaultTo(false);
      t.jsonb("metadata");
      t.uuid("userId");
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.uuid("folderId").notNullable();
      t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
      t.timestamps(true, true, true);
      t.index(["folderId", "userId"]);
    });
  }
  await createOnUpdateTrigger(knex, TableName.SecretV2);

  // many to many relation between tags
  await createJunctionTable(knex, TableName.SecretV2JnTag, TableName.SecretV2, TableName.SecretTag);

  const doesSecretV2VersionTableExist = await knex.schema.hasTable(TableName.SecretVersionV2);
  if (!doesSecretV2VersionTableExist) {
    await knex.schema.createTable(TableName.SecretVersionV2, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.integer("version").defaultTo(1).notNullable();
      t.string("type").notNullable().defaultTo(SecretType.Shared);
      t.string("key", 500).notNullable();
      t.binary("encryptedValue");
      t.binary("encryptedComment");
      t.string("reminderNote");
      t.integer("reminderRepeatDays");
      t.boolean("skipMultilineEncoding").defaultTo(false);
      t.jsonb("metadata");
      // to avoid orphan rows
      t.uuid("envId");
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      t.uuid("secretId").notNullable();
      t.uuid("folderId").notNullable();
      t.uuid("userId");
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.SecretVersionV2);

  if (!(await knex.schema.hasTable(TableName.SecretReferenceV2))) {
    await knex.schema.createTable(TableName.SecretReferenceV2, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("environment").notNullable();
      t.string("secretPath").notNullable();
      t.string("secretKey", 500).notNullable();
      t.uuid("secretId").notNullable();
      t.foreign("secretId").references("id").inTable(TableName.SecretV2).onDelete("CASCADE");
    });
  }

  await createJunctionTable(knex, TableName.SecretVersionV2Tag, TableName.SecretVersionV2, TableName.SecretTag);

  if (!(await knex.schema.hasTable(TableName.SecretApprovalRequestSecretV2))) {
    await knex.schema.createTable(TableName.SecretApprovalRequestSecretV2, (t) => {
      // everything related  to secret
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.integer("version").defaultTo(1);
      t.string("key", 500).notNullable();
      t.binary("encryptedValue");
      t.binary("encryptedComment");
      t.string("reminderNote");
      t.integer("reminderRepeatDays");
      t.boolean("skipMultilineEncoding").defaultTo(false);
      t.jsonb("metadata");
      t.timestamps(true, true, true);
      // commit details
      t.uuid("requestId").notNullable();
      t.foreign("requestId").references("id").inTable(TableName.SecretApprovalRequest).onDelete("CASCADE");
      t.string("op").notNullable();
      t.uuid("secretId");
      t.foreign("secretId").references("id").inTable(TableName.SecretV2).onDelete("SET NULL");
      t.uuid("secretVersion");
      t.foreign("secretVersion").references("id").inTable(TableName.SecretVersionV2).onDelete("SET NULL");
    });
  }

  if (!(await knex.schema.hasTable(TableName.SecretApprovalRequestSecretTagV2))) {
    await knex.schema.createTable(TableName.SecretApprovalRequestSecretTagV2, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("secretId").notNullable();
      t.foreign("secretId").references("id").inTable(TableName.SecretApprovalRequestSecretV2).onDelete("CASCADE");
      t.uuid("tagId").notNullable();
      t.foreign("tagId").references("id").inTable(TableName.SecretTag).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }

  if (!(await knex.schema.hasTable(TableName.SnapshotSecretV2))) {
    await knex.schema.createTable(TableName.SnapshotSecretV2, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("envId").index().notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      // not a relation kept like that to keep it when rolled back
      t.uuid("secretVersionId").index().notNullable();
      t.foreign("secretVersionId").references("id").inTable(TableName.SecretVersionV2).onDelete("CASCADE");
      t.uuid("snapshotId").index().notNullable();
      t.foreign("snapshotId").references("id").inTable(TableName.Snapshot).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }

  if (await knex.schema.hasTable(TableName.IntegrationAuth)) {
    const hasEncryptedAccess = await knex.schema.hasColumn(TableName.IntegrationAuth, "encryptedAccess");
    const hasEncryptedAccessId = await knex.schema.hasColumn(TableName.IntegrationAuth, "encryptedAccessId");
    const hasEncryptedRefresh = await knex.schema.hasColumn(TableName.IntegrationAuth, "encryptedRefresh");
    const hasEncryptedAwsIamAssumRole = await knex.schema.hasColumn(
      TableName.IntegrationAuth,
      "encryptedAwsAssumeIamRoleArn"
    );
    await knex.schema.alterTable(TableName.IntegrationAuth, (t) => {
      if (!hasEncryptedAccess) t.binary("encryptedAccess");
      if (!hasEncryptedAccessId) t.binary("encryptedAccessId");
      if (!hasEncryptedRefresh) t.binary("encryptedRefresh");
      if (!hasEncryptedAwsIamAssumRole) t.binary("encryptedAwsAssumeIamRoleArn");
    });
  }

  if (!(await knex.schema.hasTable(TableName.SecretRotationOutputV2))) {
    await knex.schema.createTable(TableName.SecretRotationOutputV2, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("key").notNullable();
      t.uuid("secretId").notNullable();
      t.foreign("secretId").references("id").inTable(TableName.SecretV2).onDelete("CASCADE");
      t.uuid("rotationId").notNullable();
      t.foreign("rotationId").references("id").inTable(TableName.SecretRotation).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SnapshotSecretV2);
  await knex.schema.dropTableIfExists(TableName.SecretApprovalRequestSecretTagV2);
  await knex.schema.dropTableIfExists(TableName.SecretApprovalRequestSecretV2);

  await knex.schema.dropTableIfExists(TableName.SecretV2JnTag);
  await knex.schema.dropTableIfExists(TableName.SecretReferenceV2);

  await knex.schema.dropTableIfExists(TableName.SecretRotationOutputV2);

  await dropOnUpdateTrigger(knex, TableName.SecretVersionV2);
  await knex.schema.dropTableIfExists(TableName.SecretVersionV2Tag);
  await knex.schema.dropTableIfExists(TableName.SecretVersionV2);

  await dropOnUpdateTrigger(knex, TableName.SecretV2);
  await knex.schema.dropTableIfExists(TableName.SecretV2);

  if (await knex.schema.hasTable(TableName.IntegrationAuth)) {
    const hasEncryptedAccess = await knex.schema.hasColumn(TableName.IntegrationAuth, "encryptedAccess");
    const hasEncryptedAccessId = await knex.schema.hasColumn(TableName.IntegrationAuth, "encryptedAccessId");
    const hasEncryptedRefresh = await knex.schema.hasColumn(TableName.IntegrationAuth, "encryptedRefresh");
    const hasEncryptedAwsIamAssumRole = await knex.schema.hasColumn(
      TableName.IntegrationAuth,
      "encryptedAwsAssumeIamRoleArn"
    );
    await knex.schema.alterTable(TableName.IntegrationAuth, (t) => {
      if (hasEncryptedAccess) t.dropColumn("encryptedAccess");
      if (hasEncryptedAccessId) t.dropColumn("encryptedAccessId");
      if (hasEncryptedRefresh) t.dropColumn("encryptedRefresh");
      if (hasEncryptedAwsIamAssumRole) t.dropColumn("encryptedAwsAssumeIamRoleArn");
    });
  }
}
