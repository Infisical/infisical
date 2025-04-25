import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const encryptedMicrosoftTeamsAppIdColumn = "encryptedMicrosoftTeamsAppId";
const encryptedMicrosoftTeamsClientSecretColumn = "encryptedMicrosoftTeamsClientSecret";
const encryptedMicrosoftTeamsBotIdColumn = "encryptedMicrosoftTeamsBotId";

export async function up(knex: Knex): Promise<void> {
  const superAdminHasEncryptedMicrosoftTeamsClientIdColumn = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    encryptedMicrosoftTeamsAppIdColumn
  );
  const superAdminHasEncryptedMicrosoftTeamsClientSecretColumn = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    encryptedMicrosoftTeamsClientSecretColumn
  );
  const superAdminHasEncryptedMicrosoftTeamsBotIdColumn = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    encryptedMicrosoftTeamsBotIdColumn
  );

  if (!superAdminHasEncryptedMicrosoftTeamsClientIdColumn || !superAdminHasEncryptedMicrosoftTeamsClientSecretColumn) {
    await knex.schema.alterTable(TableName.SuperAdmin, (table) => {
      if (!superAdminHasEncryptedMicrosoftTeamsClientIdColumn) {
        table.binary(encryptedMicrosoftTeamsAppIdColumn).nullable();
      }
      if (!superAdminHasEncryptedMicrosoftTeamsClientSecretColumn) {
        table.binary(encryptedMicrosoftTeamsClientSecretColumn).nullable();
      }
      if (!superAdminHasEncryptedMicrosoftTeamsBotIdColumn) {
        table.binary(encryptedMicrosoftTeamsBotIdColumn).nullable();
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
    encryptedMicrosoftTeamsAppIdColumn
  );
  const hasEncryptedMicrosoftTeamsClientSecretColumn = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    encryptedMicrosoftTeamsClientSecretColumn
  );
  const hasEncryptedMicrosoftTeamsBotIdColumn = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    encryptedMicrosoftTeamsBotIdColumn
  );

  if (hasEncryptedMicrosoftTeamsClientIdColumn || hasEncryptedMicrosoftTeamsClientSecretColumn) {
    await knex.schema.alterTable(TableName.SuperAdmin, (table) => {
      if (hasEncryptedMicrosoftTeamsClientIdColumn) {
        table.dropColumn(encryptedMicrosoftTeamsAppIdColumn);
      }
      if (hasEncryptedMicrosoftTeamsClientSecretColumn) {
        table.dropColumn(encryptedMicrosoftTeamsClientSecretColumn);
      }
      if (hasEncryptedMicrosoftTeamsBotIdColumn) {
        table.dropColumn(encryptedMicrosoftTeamsBotIdColumn);
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
