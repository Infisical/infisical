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
import { VercelEnvironmentType, VercelSyncScope } from "./vercel-sync-enums";

const VercelSyncDestinationConfigSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal(VercelSyncScope.Project),
    app: z.string().min(1, "App ID is required").describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.app),
    appName: z.string().min(1, "App Name is required").describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.appName),
    env: z.nativeEnum(VercelEnvironmentType).or(z.string()).describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.env),
    branch: z.string().optional().describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.branch),
    teamId: z.string().describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.teamId)
  }),
  z.object({
    scope: z.literal(VercelSyncScope.Team),
    teamId: z.string().min(1, "Team ID is required").describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.teamId),
    targetEnvironments: z
      .array(z.nativeEnum(VercelEnvironmentType))
      .min(1, "At least one environment is required")
      .describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.targetEnvironments),
    targetProjects: z.array(z.string()).optional().describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.targetProjects)
  })
]);

const VercelSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const VercelSyncSchema = BaseSecretSyncSchema(SecretSync.Vercel, VercelSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Vercel),
    destinationConfig: VercelSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Vercel] }));

export const CreateVercelSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Vercel,
  VercelSyncOptionsConfig
).extend({
  destinationConfig: VercelSyncDestinationConfigSchema
});

export const UpdateVercelSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Vercel,
  VercelSyncOptionsConfig
).extend({
  destinationConfig: VercelSyncDestinationConfigSchema.optional()
});

export const VercelSyncListItemSchema = z
  .object({
    name: z.literal("Vercel"),
    connection: z.literal(AppConnection.Vercel),
    destination: z.literal(SecretSync.Vercel),
    canImportSecrets: z.literal(true),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Vercel] }));
