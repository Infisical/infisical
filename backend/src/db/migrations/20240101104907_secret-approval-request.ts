import { Knex } from "knex";

import { SecretEncryptionAlgo, SecretKeyEncoding, TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretApprovalRequest))) {
    await knex.schema.createTable(TableName.SecretApprovalRequest, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("policyId").notNullable();
      t.boolean("hasMerged").defaultTo(false).notNullable();
      t.string("status").defaultTo("open").notNullable();
      t.jsonb("conflicts");
      t.foreign("policyId").references("id").inTable(TableName.SecretApprovalPolicy).onDelete("CASCADE");
      t.string("slug").notNullable();
      t.uuid("folderId").notNullable();
      t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
      t.uuid("statusChangeBy");
      t.foreign("statusChangeBy").references("id").inTable(TableName.ProjectMembership).onDelete("SET NULL");
      t.uuid("committerId").notNullable();
      t.foreign("committerId").references("id").inTable(TableName.ProjectMembership).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.SecretApprovalRequest);

  if (!(await knex.schema.hasTable(TableName.SecretApprovalRequestReviewer))) {
    await knex.schema.createTable(TableName.SecretApprovalRequestReviewer, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("member").notNullable();
      t.foreign("member").references("id").inTable(TableName.ProjectMembership).onDelete("CASCADE");
      t.string("status").notNullable();
      t.uuid("requestId").notNullable();
      t.foreign("requestId").references("id").inTable(TableName.SecretApprovalRequest).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.SecretApprovalRequestReviewer);

  if (!(await knex.schema.hasTable(TableName.SecretApprovalRequestSecret))) {
    await knex.schema.createTable(TableName.SecretApprovalRequestSecret, (t) => {
      // everything related  to secret
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.integer("version").defaultTo(1);
      t.text("secretBlindIndex");
      t.text("secretKeyCiphertext").notNullable();
      t.text("secretKeyIV").notNullable();
      t.text("secretKeyTag").notNullable();
      t.text("secretValueCiphertext").notNullable();
      t.text("secretValueIV").notNullable(); // symmetric encryption
      t.text("secretValueTag").notNullable();
      t.text("secretCommentCiphertext");
      t.text("secretCommentIV");
      t.text("secretCommentTag");
      t.string("secretReminderNote");
      t.integer("secretReminderRepeatDays");
      t.boolean("skipMultilineEncoding").defaultTo(false);
      t.string("algorithm").notNullable().defaultTo(SecretEncryptionAlgo.AES_256_GCM);
      t.string("keyEncoding").notNullable().defaultTo(SecretKeyEncoding.UTF8);
      t.jsonb("metadata");
      t.timestamps(true, true, true);
      // commit details
      t.uuid("requestId").notNullable();
      t.foreign("requestId").references("id").inTable(TableName.SecretApprovalRequest).onDelete("CASCADE");
      t.string("op").notNullable();
      t.uuid("secretId");
      t.foreign("secretId").references("id").inTable(TableName.Secret).onDelete("SET NULL");
      t.uuid("secretVersion");
      t.foreign("secretVersion").references("id").inTable(TableName.SecretVersion).onDelete("SET NULL");
    });
  }
  await createOnUpdateTrigger(knex, TableName.SecretApprovalRequestSecret);

  if (!(await knex.schema.hasTable(TableName.SecretApprovalRequestSecretTag))) {
    await knex.schema.createTable(TableName.SecretApprovalRequestSecretTag, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("secretId").notNullable();
      t.foreign("secretId").references("id").inTable(TableName.SecretApprovalRequestSecret).onDelete("CASCADE");
      t.uuid("tagId").notNullable();
      t.foreign("tagId").references("id").inTable(TableName.SecretTag).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.SecretApprovalRequestSecretTag);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretApprovalRequestSecretTag);
  await knex.schema.dropTableIfExists(TableName.SecretApprovalRequestSecret);
  await knex.schema.dropTableIfExists(TableName.SecretApprovalRequestReviewer);
  await knex.schema.dropTableIfExists(TableName.SecretApprovalRequest);

  await dropOnUpdateTrigger(knex, TableName.SecretApprovalRequestSecretTag);
  await dropOnUpdateTrigger(knex, TableName.SecretApprovalRequestSecret);
  await dropOnUpdateTrigger(knex, TableName.SecretApprovalRequestReviewer);
  await dropOnUpdateTrigger(knex, TableName.SecretApprovalRequest);
}
