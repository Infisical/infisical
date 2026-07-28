import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SpaceliftConfigType } from "./spacelift-sync-constants";

const SpaceliftSyncDestinationConfigSchema = z
  .object({
    contextId: z
      .string()
      .trim()
      .min(1, "Context ID is required")
      .describe(SecretSyncs.DESTINATION_CONFIG.SPACELIFT.contextId),
    contextName: z
      .string()
      .trim()
      .min(1, "Context name is required")
      .describe(SecretSyncs.DESTINATION_CONFIG.SPACELIFT.contextName),
    configType: z.nativeEnum(SpaceliftConfigType).describe(SecretSyncs.DESTINATION_CONFIG.SPACELIFT.configType),
    mountPath: z.string().trim().optional().describe(SecretSyncs.DESTINATION_CONFIG.SPACELIFT.mountPath)
  })
  .superRefine((data, ctx) => {
    if (data.configType === SpaceliftConfigType.FileMount && !data.mountPath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "File path is required when config type is file mount",
        path: ["mountPath"]
      });
    }
  });

const SpaceliftSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

const SpaceliftSyncOptionsSchema = z.object({
  writeOnly: z.boolean().optional().default(false).describe(SecretSyncs.ADDITIONAL_SYNC_OPTIONS.SPACELIFT.writeOnly)
});

export const SpaceliftSyncSchema = BaseSecretSyncSchema(
  SecretSync.Spacelift,
  SpaceliftSyncOptionsConfig,
  SpaceliftSyncOptionsSchema
)
  .extend({
    destination: z.literal(SecretSync.Spacelift),
    destinationConfig: SpaceliftSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Spacelift] }));

export const CreateSpaceliftSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Spacelift,
  SpaceliftSyncOptionsConfig,
  SpaceliftSyncOptionsSchema
).extend({
  destinationConfig: SpaceliftSyncDestinationConfigSchema
});

export const UpdateSpaceliftSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Spacelift,
  SpaceliftSyncOptionsConfig,
  SpaceliftSyncOptionsSchema
).extend({
  destinationConfig: SpaceliftSyncDestinationConfigSchema.optional()
});

export const SpaceliftSyncListItemSchema = z
  .object({
    name: z.literal("Spacelift"),
    connection: z.literal(AppConnection.Spacelift),
    destination: z.literal(SecretSync.Spacelift),
    canImportSecrets: z.literal(true),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Spacelift] }));
