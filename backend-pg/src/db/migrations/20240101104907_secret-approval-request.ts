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
      t.foreign("policyId")
        .references("id")
        .inTable(TableName.SecretApprovalPolicy)
        .onDelete("CASCADE");
      t.string("slug").notNullable();
      t.uuid("folderId").notNullable();
      t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
      t.uuid("statusChangeBy");
      t.foreign("statusChangeBy")
        .references("id")
        .inTable(TableName.ProjectMembership)
        .onDelete("CASCADE");
      t.uuid("committerId").notNullable();
      t.foreign("committerId")
        .references("id")
        .inTable(TableName.ProjectMembership)
        .onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.SecretApprovalRequest);

  if (!(await knex.schema.hasTable(TableName.SarReviewer))) {
    await knex.schema.createTable(TableName.SarReviewer, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("member").notNullable();
      t.foreign("member").references("id").inTable(TableName.ProjectMembership).onDelete("CASCADE");
      t.string("status").notNullable();
      t.uuid("requestId").notNullable();
      t.foreign("requestId")
        .references("id")
        .inTable(TableName.SecretApprovalRequest)
        .onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.SarReviewer);

  if (!(await knex.schema.hasTable(TableName.SarSecret))) {
    await knex.schema.createTable(TableName.SarSecret, (t) => {
      // everything related  to secret
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.integer("version").defaultTo(1);
      t.text("secretBlindIndex").notNullable();
      t.text("secretKeyCiphertext").notNullable();
      t.text("secretKeyIV").notNullable();
      t.text("secretKeyTag").notNullable();
      t.text("secretValueCiphertext").notNullable();
      t.text("secretValueIV").notNullable(); // symmetric encryption
      t.text("secretValueTag").notNullable();
      t.text("secretCommentCiphertext");
      t.text("secretCommentIV");
      t.text("secretCommentTag");
      t.string("secretReminderNotice");
      t.integer("secretReminderRepeatDays");
      t.boolean("skipMultilineEncoding").defaultTo(false);
      t.string("algorithm").notNullable().defaultTo(SecretEncryptionAlgo.AES_256_GCM);
      t.string("keyEncoding").notNullable().defaultTo(SecretKeyEncoding.UTF8);
      t.jsonb("metadata");
      t.timestamps(true, true, true);
      // commit details
      t.uuid("requestId").notNullable();
      t.foreign("requestId")
        .references("id")
        .inTable(TableName.SecretApprovalRequest)
        .onDelete("CASCADE");
      t.string("op").notNullable();
      t.uuid("secretId");
      t.foreign("secretId").references("id").inTable(TableName.Secret).onDelete("SET NULL");
      t.uuid("secretVersion");
      t.foreign("secretVersion")
        .references("id")
        .inTable(TableName.SecretVersion)
        .onDelete("SET NULL");
    });
  }
  await createOnUpdateTrigger(knex, TableName.SarSecret);

  if (!(await knex.schema.hasTable(TableName.SarSecretTag))) {
    await knex.schema.createTable(TableName.SarSecretTag, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("secretId").notNullable();
      t.foreign("secretId").references("id").inTable(TableName.SarSecret).onDelete("CASCADE");
      t.uuid("tagId").notNullable();
      t.foreign("tagId").references("id").inTable(TableName.SecretTag).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.SarSecretTag);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretTag);
  await knex.schema.dropTableIfExists(TableName.SarSecret);
  await knex.schema.dropTableIfExists(TableName.SarReviewer);
  await knex.schema.dropTableIfExists(TableName.SecretApprovalRequest);

  await dropOnUpdateTrigger(knex, TableName.SarSecretTag);
  await dropOnUpdateTrigger(knex, TableName.SarSecret);
  await dropOnUpdateTrigger(knex, TableName.SarReviewer);
  await dropOnUpdateTrigger(knex, TableName.SecretApprovalRequest);
}
