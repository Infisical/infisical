import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const superAdminHasEncryptedMicrosoftTeamsClientIdColumn = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    "encryptedMicrosoftTeamsAppId"
  );
  const superAdminHasEncryptedMicrosoftTeamsClientSecret = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    "encryptedMicrosoftTeamsClientSecret"
  );
  const superAdminHasEncryptedMicrosoftTeamsBotId = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    "encryptedMicrosoftTeamsBotId"
  );

  if (
    !superAdminHasEncryptedMicrosoftTeamsClientIdColumn ||
    !superAdminHasEncryptedMicrosoftTeamsClientSecret ||
    !superAdminHasEncryptedMicrosoftTeamsBotId
  ) {
    await knex.schema.alterTable(TableName.SuperAdmin, (table) => {
      if (!superAdminHasEncryptedMicrosoftTeamsClientIdColumn) {
        table.binary("encryptedMicrosoftTeamsAppId").nullable();
      }
      if (!superAdminHasEncryptedMicrosoftTeamsClientSecret) {
        table.binary("encryptedMicrosoftTeamsClientSecret").nullable();
      }
      if (!superAdminHasEncryptedMicrosoftTeamsBotId) {
        table.binary("encryptedMicrosoftTeamsBotId").nullable();
      }
    });
  }

  if (!(await knex.schema.hasColumn(TableName.WorkflowIntegrations, "status"))) {
    await knex.schema.alterTable(TableName.WorkflowIntegrations, (table) => {
      table.enu("status", ["pending", "installed", "failed"]).notNullable().defaultTo("installed"); // defaults to installed so we can have backwards compatibility with existing workflow integrations
    });
  }

  if (!(await knex.schema.hasTable(TableName.MicrosoftTeamsIntegrations))) {
    await knex.schema.createTable(TableName.MicrosoftTeamsIntegrations, (table) => {
      table.uuid("id", { primaryKey: true }).notNullable();
      table.foreign("id").references("id").inTable(TableName.WorkflowIntegrations).onDelete("CASCADE"); // the ID itself is the workflow integration ID

      table.string("internalTeamsAppId").nullable();
      table.string("tenantId").notNullable();
      table.binary("encryptedAccessToken").nullable();
      table.binary("encryptedBotAccessToken").nullable();

      table.timestamp("accessTokenExpiresAt").nullable();
      table.timestamp("botAccessTokenExpiresAt").nullable();

      table.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.MicrosoftTeamsIntegrations);
  }

  if (!(await knex.schema.hasTable(TableName.ProjectMicrosoftTeamsConfigs))) {
    await knex.schema.createTable(TableName.ProjectMicrosoftTeamsConfigs, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.string("projectId").notNullable().unique();
      tb.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      tb.uuid("microsoftTeamsIntegrationId").notNullable();
      tb.foreign("microsoftTeamsIntegrationId")
        .references("id")
        .inTable(TableName.MicrosoftTeamsIntegrations)
        .onDelete("CASCADE");
      tb.boolean("isAccessRequestNotificationEnabled").notNullable().defaultTo(false);
      tb.boolean("isSecretRequestNotificationEnabled").notNullable().defaultTo(false);

      tb.jsonb("accessRequestChannels").notNullable(); // {teamId: string, channelIds: string[]}
      tb.jsonb("secretRequestChannels").notNullable(); // {teamId: string, channelIds: string[]}
      tb.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.ProjectMicrosoftTeamsConfigs);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasEncryptedMicrosoftTeamsClientIdColumn = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    "encryptedMicrosoftTeamsAppId"
  );
  const hasEncryptedMicrosoftTeamsClientSecret = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    "encryptedMicrosoftTeamsClientSecret"
  );
  const hasEncryptedMicrosoftTeamsBotId = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    "encryptedMicrosoftTeamsBotId"
  );

  if (
    hasEncryptedMicrosoftTeamsClientIdColumn ||
    hasEncryptedMicrosoftTeamsClientSecret ||
    hasEncryptedMicrosoftTeamsBotId
  ) {
    await knex.schema.alterTable(TableName.SuperAdmin, (table) => {
      if (hasEncryptedMicrosoftTeamsClientIdColumn) {
        table.dropColumn("encryptedMicrosoftTeamsAppId");
      }
      if (hasEncryptedMicrosoftTeamsClientSecret) {
        table.dropColumn("encryptedMicrosoftTeamsClientSecret");
      }
      if (hasEncryptedMicrosoftTeamsBotId) {
        table.dropColumn("encryptedMicrosoftTeamsBotId");
      }
    });
  }
  if (await knex.schema.hasColumn(TableName.WorkflowIntegrations, "status")) {
    await knex.schema.alterTable(TableName.WorkflowIntegrations, (table) => {
      table.dropColumn("status");
    });
  }

  if (await knex.schema.hasTable(TableName.ProjectMicrosoftTeamsConfigs)) {
    await knex.schema.dropTableIfExists(TableName.ProjectMicrosoftTeamsConfigs);
    await dropOnUpdateTrigger(knex, TableName.ProjectMicrosoftTeamsConfigs);
  }
  if (await knex.schema.hasTable(TableName.MicrosoftTeamsIntegrations)) {
    await knex.schema.dropTableIfExists(TableName.MicrosoftTeamsIntegrations);
    await dropOnUpdateTrigger(knex, TableName.MicrosoftTeamsIntegrations);
  }
}
