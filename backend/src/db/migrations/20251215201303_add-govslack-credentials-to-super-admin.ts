import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SuperAdmin)) {
    const hasGovSlackClientId = await knex.schema.hasColumn(TableName.SuperAdmin, "encryptedGovSlackClientId");
    const hasGovSlackClientSecret = await knex.schema.hasColumn(TableName.SuperAdmin, "encryptedGovSlackClientSecret");

    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      if (!hasGovSlackClientId) {
        t.binary("encryptedGovSlackClientId").nullable();
      }
      if (!hasGovSlackClientSecret) {
        t.binary("encryptedGovSlackClientSecret").nullable();
      }
    });
  }

  if (await knex.schema.hasTable(TableName.SlackIntegrations)) {
    const hasIsGovSlack = await knex.schema.hasColumn(TableName.SlackIntegrations, "isGovSlack");

    if (!hasIsGovSlack) {
      await knex.schema.alterTable(TableName.SlackIntegrations, (t) => {
        t.boolean("isGovSlack").defaultTo(false).notNullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SuperAdmin)) {
    const hasGovSlackClientId = await knex.schema.hasColumn(TableName.SuperAdmin, "encryptedGovSlackClientId");
    const hasGovSlackClientSecret = await knex.schema.hasColumn(TableName.SuperAdmin, "encryptedGovSlackClientSecret");

    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      if (hasGovSlackClientId) {
        t.dropColumn("encryptedGovSlackClientId");
      }
      if (hasGovSlackClientSecret) {
        t.dropColumn("encryptedGovSlackClientSecret");
      }
    });
  }
  if (await knex.schema.hasTable(TableName.SlackIntegrations)) {
    const hasIsGovSlack = await knex.schema.hasColumn(TableName.SlackIntegrations, "isGovSlack");

    if (hasIsGovSlack) {
      await knex.schema.alterTable(TableName.SlackIntegrations, (t) => {
        t.dropColumn("isGovSlack");
      });
    }
  }
}
