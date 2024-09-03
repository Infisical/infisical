import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SlackIntegrations))) {
    await knex.schema.createTable(TableName.SlackIntegrations, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.string("slug").notNullable();
      tb.uuid("orgId").notNullable();
      tb.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      tb.string("description");
      tb.string("teamId").notNullable();
      tb.string("teamName").notNullable();
      tb.string("slackUserId").notNullable();
      tb.string("slackAppId").notNullable();
      tb.binary("encryptedBotAccessToken").notNullable();
      tb.string("slackBotId").notNullable();
      tb.string("slackBotUserId").notNullable();
      tb.unique(["orgId", "slug"]);
      tb.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.SlackIntegrations);
  }

  if (!(await knex.schema.hasTable(TableName.ProjectSlackConfigs))) {
    await knex.schema.createTable(TableName.ProjectSlackConfigs, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.string("projectId").notNullable().unique();
      tb.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      tb.uuid("slackIntegrationId").notNullable();
      tb.foreign("slackIntegrationId").references("id").inTable(TableName.SlackIntegrations).onDelete("CASCADE");
      tb.boolean("isAccessRequestNotificationEnabled").notNullable().defaultTo(false);
      tb.string("accessRequestChannels").notNullable().defaultTo("");
      tb.boolean("isSecretRequestNotificationEnabled").notNullable().defaultTo(false);
      tb.string("secretRequestChannels").notNullable().defaultTo("");
      tb.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.ProjectSlackConfigs);
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
  await knex.schema.dropTableIfExists(TableName.ProjectSlackConfigs);
  await dropOnUpdateTrigger(knex, TableName.ProjectSlackConfigs);

  await knex.schema.dropTableIfExists(TableName.AdminSlackConfig);
  await dropOnUpdateTrigger(knex, TableName.AdminSlackConfig);

  await knex.schema.dropTableIfExists(TableName.SlackIntegrations);
  await dropOnUpdateTrigger(knex, TableName.SlackIntegrations);
}
