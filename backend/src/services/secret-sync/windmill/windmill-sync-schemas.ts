import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

const pathCharacterValidator = characterValidator([
  CharacterType.AlphaNumeric,
  CharacterType.Underscore,
  CharacterType.Hyphen
]);

const WindmillSyncDestinationConfigSchema = z.object({
  workspace: z.string().trim().min(1, "Workspace required").describe(SecretSyncs.DESTINATION_CONFIG.WINDMILL.workspace),
  path: z
    .string()
    .trim()
    .min(1, "Path required")
    .refine(
      (val) =>
        (val.startsWith("u/") || val.startsWith("f/")) &&
        val.endsWith("/") &&
        val.split("/").length >= 3 &&
        val
          .split("/")
          .slice(0, -1) // Remove last empty segment from trailing slash
          .every((segment) => segment && pathCharacterValidator(segment)),
      'Invalid path - must follow Windmill path format. ex: "f/folder/path/"'
    )
    .describe(SecretSyncs.DESTINATION_CONFIG.WINDMILL.path)
});

const WindmillSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const WindmillSyncSchema = BaseSecretSyncSchema(SecretSync.Windmill, WindmillSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Windmill),
    destinationConfig: WindmillSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Windmill] }));

export const CreateWindmillSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Windmill,
  WindmillSyncOptionsConfig
).extend({
  destinationConfig: WindmillSyncDestinationConfigSchema
});

export const UpdateWindmillSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Windmill,
  WindmillSyncOptionsConfig
).extend({
  destinationConfig: WindmillSyncDestinationConfigSchema.optional()
});

export const WindmillSyncListItemSchema = z
  .object({
    name: z.literal("Windmill"),
    connection: z.literal(AppConnection.Windmill),
    destination: z.literal(SecretSync.Windmill),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Windmill] }));
