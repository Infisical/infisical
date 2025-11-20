import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

const TeamCitySyncDestinationConfigSchema = z.object({
  project: z.string().trim().min(1, "Project required").describe(SecretSyncs.DESTINATION_CONFIG.TEAMCITY.project),
  buildConfig: z.string().trim().optional().describe(SecretSyncs.DESTINATION_CONFIG.TEAMCITY.buildConfig)
});

const TeamCitySyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const TeamCitySyncSchema = BaseSecretSyncSchema(SecretSync.TeamCity, TeamCitySyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.TeamCity),
    destinationConfig: TeamCitySyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.TeamCity] }));

export const CreateTeamCitySyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.TeamCity,
  TeamCitySyncOptionsConfig
).extend({
  destinationConfig: TeamCitySyncDestinationConfigSchema
});

export const UpdateTeamCitySyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.TeamCity,
  TeamCitySyncOptionsConfig
).extend({
  destinationConfig: TeamCitySyncDestinationConfigSchema.optional()
});

export const TeamCitySyncListItemSchema = z
  .object({
    name: z.literal("TeamCity"),
    connection: z.literal(AppConnection.TeamCity),
    destination: z.literal(SecretSync.TeamCity),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.TeamCity] }));
