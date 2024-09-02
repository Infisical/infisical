import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SlackIntegrations))) {
    await knex.schema.createTable(TableName.SlackIntegrations, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.string("projectId").notNullable().unique();
      tb.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      tb.string("teamId").notNullable();
      tb.string("teamName").notNullable();
      tb.string("slackUserId").notNullable();
      tb.string("slackAppId").notNullable();
      tb.binary("encryptedBotAccessToken").notNullable();
      tb.string("slackBotId").notNullable();
      tb.string("slackBotUserId").notNullable();
      tb.boolean("isAccessRequestNotificationEnabled").defaultTo(false);
      tb.string("accessRequestChannels").defaultTo("");
      tb.boolean("isSecretRequestNotificationEnabled").defaultTo(false);
      tb.string("secretRequestChannels").defaultTo("");
      tb.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.SlackIntegrations);
  }

  if (!(await knex.schema.hasTable(TableName.AdminSlackConfig))) {
    await knex.schema.createTable(TableName.AdminSlackConfig, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.binary("encryptedClientId").notNullable();
      tb.binary("encryptedClientSecret").notNullable();
      tb.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.AdminSlackConfig);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SlackIntegrations);
  await dropOnUpdateTrigger(knex, TableName.SlackIntegrations);

  await knex.schema.dropTableIfExists(TableName.AdminSlackConfig);
  await dropOnUpdateTrigger(knex, TableName.AdminSlackConfig);
}
