import { Knex } from "knex";

import { WebhookType } from "@app/services/webhook/webhook-types";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasEncryptedURL = await knex.schema.hasColumn(TableName.Webhook, "encryptedUrl");
  const hasUrlIV = await knex.schema.hasColumn(TableName.Webhook, "urlIV");
  const hasUrlTag = await knex.schema.hasColumn(TableName.Webhook, "urlTag");
  const hasType = await knex.schema.hasColumn(TableName.Webhook, "type");

  await knex.schema.alterTable(TableName.Webhook, (tb) => {
    if (!hasEncryptedURL) {
      tb.text("encryptedUrl");
    }
    if (!hasUrlIV) {
      tb.string("urlIV");
    }
    if (!hasUrlTag) {
      tb.string("urlTag");
    }
    if (!hasType) {
      tb.string("type").defaultTo(WebhookType.GENERAL);
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasEncryptedURL = await knex.schema.hasColumn(TableName.Webhook, "encryptedUrl");
  const hasUrlIV = await knex.schema.hasColumn(TableName.Webhook, "urlIV");
  const hasUrlTag = await knex.schema.hasColumn(TableName.Webhook, "urlTag");
  const hasType = await knex.schema.hasColumn(TableName.Webhook, "type");

  await knex.schema.alterTable(TableName.Webhook, (t) => {
    if (hasEncryptedURL) {
      t.dropColumn("encryptedUrl");
    }
    if (hasUrlIV) {
      t.dropColumn("urlIV");
    }
    if (hasUrlTag) {
      t.dropColumn("urlTag");
    }
    if (hasType) {
      t.dropColumn("type");
    }
  });
}
