/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Knex } from "knex";

import { infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { selectAllTableCols } from "@app/lib/knex/select";

import { SecretKeyEncoding, SecretType, TableName } from "../schemas";
import { createJunctionTable, createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";
import { getSecretManagerDataKey } from "./utils/kms";

const backfillWebhooks = async (knex: Knex) => {
  const hasEncryptedSecretKeyWithKms = await knex.schema.hasColumn(TableName.Webhook, "encryptedSecretKeyWithKms");
  const hasEncryptedWebhookUrl = await knex.schema.hasColumn(TableName.Webhook, "encryptedUrl");
  const hasUrlCipherText = await knex.schema.hasColumn(TableName.Webhook, "urlCipherText");
  const hasUrlIV = await knex.schema.hasColumn(TableName.Webhook, "urlIV");
  const hasUrlTag = await knex.schema.hasColumn(TableName.Webhook, "urlTag");
  const hasEncryptedSecretKey = await knex.schema.hasColumn(TableName.Webhook, "encryptedSecretKey");
  const hasIV = await knex.schema.hasColumn(TableName.Webhook, "iv");
  const hasTag = await knex.schema.hasColumn(TableName.Webhook, "tag");
  const hasKeyEncoding = await knex.schema.hasColumn(TableName.Webhook, "keyEncoding");
  const hasAlgorithm = await knex.schema.hasColumn(TableName.Webhook, "algorithm");
  const hasUrl = await knex.schema.hasColumn(TableName.Webhook, "url");

  await knex.schema.alterTable(TableName.Webhook, (t) => {
    if (!hasEncryptedSecretKeyWithKms) t.binary("encryptedSecretKeyWithKms");
    if (!hasEncryptedWebhookUrl) t.binary("encryptedUrl");
    if (hasUrl) t.string("url").nullable().alter();
  });

  const kmsEncryptorGroupByProjectId: Record<string, Awaited<ReturnType<typeof getSecretManagerDataKey>>["encryptor"]> =
    {};
  if (hasUrlCipherText && hasUrlIV && hasUrlTag && hasEncryptedSecretKey && hasIV && hasTag) {
    // eslint-disable-next-line
    const webhooksToFill = await knex(TableName.Webhook)
      .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.Webhook}.envId`)
      .whereNull("encryptedUrl")
      // eslint-disable-next-line
      // @ts-ignore knex migration fails
      .select(selectAllTableCols(TableName.Webhook))
      .select("projectId");

    const updatedWebhooks = [];
    for (const webhook of webhooksToFill) {
      if (!kmsEncryptorGroupByProjectId[webhook.projectId]) {
        // eslint-disable-next-line
        const { encryptor } = await getSecretManagerDataKey(knex, webhook.projectId);
        kmsEncryptorGroupByProjectId[webhook.projectId] = encryptor;
      }

      const kmsEncryptor = kmsEncryptorGroupByProjectId[webhook.projectId];

      // @ts-ignore post migration fails
      let webhookUrl = webhook.url;
      let webhookSecretKey;

      // @ts-ignore post migration fails
      if (webhook.urlTag && webhook.urlCipherText && webhook.urlIV) {
        webhookUrl = infisicalSymmetricDecrypt({
          // @ts-ignore post migration fails
          keyEncoding: webhook.keyEncoding as SecretKeyEncoding,
          // @ts-ignore post migration fails
          ciphertext: webhook.urlCipherText,
          // @ts-ignore post migration fails
          iv: webhook.urlIV,
          // @ts-ignore post migration fails
          tag: webhook.urlTag
        });
      }
      // @ts-ignore post migration fails
      if (webhook.encryptedSecretKey && webhook.iv && webhook.tag) {
        webhookSecretKey = infisicalSymmetricDecrypt({
          // @ts-ignore post migration fails
          keyEncoding: webhook.keyEncoding as SecretKeyEncoding,
          // @ts-ignore post migration fails
          ciphertext: webhook.encryptedSecretKey,
          // @ts-ignore post migration fails
          iv: webhook.iv,
          // @ts-ignore post migration fails
          tag: webhook.tag
        });
      }
      const { projectId, ...el } = webhook;
      updatedWebhooks.push({
        ...el,
        encryptedSecretKeyWithKms: webhookSecretKey
          ? kmsEncryptor({ plainText: Buffer.from(webhookSecretKey) }).cipherTextBlob
          : null,
        encryptedUrl: kmsEncryptor({ plainText: Buffer.from(webhookUrl) }).cipherTextBlob
      });
    }
    if (updatedWebhooks.length) {
      // eslint-disable-next-line
      await knex(TableName.Webhook).insert(updatedWebhooks).onConflict("id").merge();
    }
  }
  await knex.schema.alterTable(TableName.Webhook, (t) => {
    t.binary("encryptedUrl").notNullable().alter();

    if (hasUrlIV) t.dropColumn("urlIV");
    if (hasUrlCipherText) t.dropColumn("urlCipherText");
    if (hasUrlTag) t.dropColumn("urlTag");
    if (hasIV) t.dropColumn("iv");
    if (hasTag) t.dropColumn("tag");
    if (hasEncryptedSecretKey) t.dropColumn("encryptedSecretKey");
    if (hasKeyEncoding) t.dropColumn("keyEncoding");
    if (hasAlgorithm) t.dropColumn("algorithm");
    if (hasUrl) t.dropColumn("url");
  });
};

const backfillDynamicSecretConfigs = async (knex: Knex) => {
  const hasEncryptedConfig = await knex.schema.hasColumn(TableName.DynamicSecret, "encryptedConfig");

  const hasInputCipherText = await knex.schema.hasColumn(TableName.DynamicSecret, "inputCiphertext");
  const hasInputIV = await knex.schema.hasColumn(TableName.DynamicSecret, "inputIV");
  const hasInputTag = await knex.schema.hasColumn(TableName.DynamicSecret, "inputTag");
  const hasKeyEncoding = await knex.schema.hasColumn(TableName.DynamicSecret, "keyEncoding");
  const hasAlgorithm = await knex.schema.hasColumn(TableName.DynamicSecret, "algorithm");

  await knex.schema.alterTable(TableName.DynamicSecret, (t) => {
    if (!hasEncryptedConfig) t.binary("encryptedConfig");
  });
  const kmsEncryptorGroupByProjectId: Record<string, Awaited<ReturnType<typeof getSecretManagerDataKey>>["encryptor"]> =
    {};
  if (hasInputCipherText && hasInputIV && hasInputTag) {
    // eslint-disable-next-line
    const dynamicSecretConfigs = await knex(TableName.DynamicSecret)
      .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.DynamicSecret}.folderId`)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .whereNull("encryptedConfig")
      // @ts-ignore post migration fails
      .select(selectAllTableCols(TableName.DynamicSecret))
      .select("projectId");

    const updatedConfigs = [];
    for (const dynamicSecretConfig of dynamicSecretConfigs) {
      if (!kmsEncryptorGroupByProjectId[dynamicSecretConfig.projectId]) {
        // eslint-disable-next-line
        const { encryptor } = await getSecretManagerDataKey(knex, dynamicSecretConfig.projectId);
        kmsEncryptorGroupByProjectId[dynamicSecretConfig.projectId] = encryptor;
      }

      const kmsEncryptor = kmsEncryptorGroupByProjectId[dynamicSecretConfig.projectId];
      const inputConfig = infisicalSymmetricDecrypt({
        // @ts-ignore post migration fails
        keyEncoding: dynamicSecretConfig.keyEncoding as SecretKeyEncoding,
        // @ts-ignore post migration fails
        ciphertext: dynamicSecretConfig.inputCiphertext as string,
        // @ts-ignore post migration fails
        iv: dynamicSecretConfig.inputIV as string,
        // @ts-ignore post migration fails
        tag: dynamicSecretConfig.inputTag as string
      });

      const { projectId, ...el } = dynamicSecretConfig;
      updatedConfigs.push({
        ...el,
        encryptedConfig: kmsEncryptor({ plainText: Buffer.from(inputConfig) }).cipherTextBlob
      });
    }
    if (updatedConfigs.length) {
      // eslint-disable-next-line
      await knex(TableName.DynamicSecret).insert(updatedConfigs).onConflict("id").merge();
    }
  }
  await knex.schema.alterTable(TableName.DynamicSecret, (t) => {
    t.binary("encryptedConfig").notNullable().alter();

    if (hasInputTag) t.dropColumn("inputTag");
    if (hasInputIV) t.dropColumn("inputIV");
    if (hasInputCipherText) t.dropColumn("inputCiphertext");
    if (hasKeyEncoding) t.dropColumn("keyEncoding");
    if (hasAlgorithm) t.dropColumn("algorithm");
  });
};

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

  if (await knex.schema.hasTable(TableName.Webhook)) {
    await backfillWebhooks(knex);
  }

  if (await knex.schema.hasTable(TableName.DynamicSecret)) {
    await backfillDynamicSecretConfigs(knex);
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
  if (await knex.schema.hasTable(TableName.Webhook)) {
    const hasEncryptedWebhookSecretKey = await knex.schema.hasColumn(TableName.Webhook, "encryptedSecretKeyWithKms");
    const hasEncryptedWebhookUrl = await knex.schema.hasColumn(TableName.Webhook, "encryptedUrl");
    const hasUrlCipherText = await knex.schema.hasColumn(TableName.Webhook, "urlCipherText");
    const hasUrlIV = await knex.schema.hasColumn(TableName.Webhook, "urlIV");
    const hasUrlTag = await knex.schema.hasColumn(TableName.Webhook, "urlTag");
    const hasEncryptedSecretKey = await knex.schema.hasColumn(TableName.Webhook, "encryptedSecretKey");
    const hasIV = await knex.schema.hasColumn(TableName.Webhook, "iv");
    const hasTag = await knex.schema.hasColumn(TableName.Webhook, "tag");
    const hasKeyEncoding = await knex.schema.hasColumn(TableName.Webhook, "keyEncoding");
    const hasAlgorithm = await knex.schema.hasColumn(TableName.Webhook, "algorithm");
    const hasUrl = await knex.schema.hasColumn(TableName.Webhook, "url");

    await knex.schema.alterTable(TableName.Webhook, (t) => {
      if (hasEncryptedWebhookSecretKey) t.dropColumn("encryptedSecretKeyWithKms");
      if (hasEncryptedWebhookUrl) t.dropColumn("encryptedUrl");
      if (!hasUrl) t.string("url");
      if (!hasEncryptedSecretKey) t.string("encryptedSecretKey");
      if (!hasIV) t.string("iv");
      if (!hasTag) t.string("tag");
      if (!hasAlgorithm) t.string("algorithm");
      if (!hasKeyEncoding) t.string("keyEncoding");
      if (!hasUrlCipherText) t.string("urlCipherText");
      if (!hasUrlIV) t.string("urlIV");
      if (!hasUrlTag) t.string("urlTag");
    });
  }

  if (await knex.schema.hasTable(TableName.DynamicSecret)) {
    const hasEncryptedConfig = await knex.schema.hasColumn(TableName.DynamicSecret, "encryptedConfig");

    const hasInputIV = await knex.schema.hasColumn(TableName.DynamicSecret, "inputIV");
    const hasInputCipherText = await knex.schema.hasColumn(TableName.DynamicSecret, "inputCiphertext");
    const hasInputTag = await knex.schema.hasColumn(TableName.DynamicSecret, "inputTag");
    const hasAlgorithm = await knex.schema.hasColumn(TableName.DynamicSecret, "algorithm");
    const hasKeyEncoding = await knex.schema.hasColumn(TableName.DynamicSecret, "keyEncoding");
    await knex.schema.alterTable(TableName.DynamicSecret, (t) => {
      if (hasEncryptedConfig) t.dropColumn("encryptedConfig");
      if (!hasInputIV) t.string("inputIV");
      if (!hasInputCipherText) t.text("inputCiphertext");
      if (!hasInputTag) t.string("inputTag");
      if (!hasAlgorithm) t.string("algorithm");
      if (!hasKeyEncoding) t.string("keyEncoding");
    });
  }
}
