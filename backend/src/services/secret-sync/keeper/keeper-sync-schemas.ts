import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { KEEPER_UID_PATTERN } from "@app/services/app-connection/keeper";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

const KeeperSyncDestinationConfigSchema = z.object({
  folderUid: z
    .string()
    .trim()
    .min(1, "Shared folder required")
    .max(64, "Shared folder UID cannot exceed 64 characters")
    .regex(KEEPER_UID_PATTERN, "Shared folder UID can only contain letters, digits, hyphens and underscores")
    .refine(
      (uid) => !uid.startsWith("-"),
      "Keeper Commander Service Mode cannot address a shared folder whose UID starts with '-'. Choose a different shared folder."
    )
    .describe(SecretSyncs.DESTINATION_CONFIG.KEEPER.folderUid),
  folderName: z
    .string()
    .trim()
    .max(255, "Shared folder name cannot exceed 255 characters")
    .optional()
    .describe(SecretSyncs.DESTINATION_CONFIG.KEEPER.folderName)
});

const KeeperSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const KeeperSyncSchema = BaseSecretSyncSchema(SecretSync.Keeper, KeeperSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Keeper),
    destinationConfig: KeeperSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Keeper] }));

export const CreateKeeperSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Keeper,
  KeeperSyncOptionsConfig
).extend({
  destinationConfig: KeeperSyncDestinationConfigSchema
});

export const UpdateKeeperSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Keeper,
  KeeperSyncOptionsConfig
).extend({
  destinationConfig: KeeperSyncDestinationConfigSchema.optional()
});

export const KeeperSyncListItemSchema = z
  .object({
    name: z.literal("Keeper"),
    connection: z.literal(AppConnection.Keeper),
    destination: z.literal(SecretSync.Keeper),
    canImportSecrets: z.literal(true),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Keeper] }));
