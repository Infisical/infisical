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

const VercelSyncDestinationConfigSchema = z
  .discriminatedUnion("scope", [
    z.object({
      scope: z.literal(VercelSyncScope.Project),
      app: z.string().min(1, "App ID is required").describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.app),
      appName: z.string().min(1, "App Name is required").describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.appName),
      env: z.nativeEnum(VercelEnvironmentType).or(z.string()).describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.env),
      branch: z.string().optional().describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.branch),
      teamId: z.string().describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.teamId),
      sensitive: z.boolean().default(false).describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.sensitive)
    }),
    z.object({
      scope: z.literal(VercelSyncScope.Team),
      teamId: z.string().min(1, "Team ID is required").describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.teamId),
      teamName: z.string().optional().describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.teamName),
      targetEnvironments: z
        .array(z.nativeEnum(VercelEnvironmentType))
        .optional()
        .default([])
        .describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.targetEnvironments),
      applyToAllCustomEnvironments: z
        .boolean()
        .optional()
        .default(false)
        .describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.applyToAllCustomEnvironments),
      targetProjects: z.array(z.string()).optional().describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.targetProjects),
      sensitive: z.boolean().default(false).describe(SecretSyncs.DESTINATION_CONFIG.VERCEL.sensitive)
    })
  ])
  .superRefine((config, ctx) => {
    if (config.scope === VercelSyncScope.Team) {
      if (!config.targetEnvironments?.length && !config.applyToAllCustomEnvironments) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one target environment or applyToAllCustomEnvironments must be set.",
          path: ["targetEnvironments"]
        });
      }
    }

    if (!config.sensitive) return;

    if (config.scope === VercelSyncScope.Project && config.env === VercelEnvironmentType.Development) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Marking secrets as sensitive in Vercel is not supported for development environments.",
        path: ["sensitive"]
      });
    }
  });

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
