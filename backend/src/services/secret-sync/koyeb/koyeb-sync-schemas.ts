import { z } from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

const KoyebSyncDestinationConfigSchema = z.object({});

const KoyebSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const KoyebSyncSchema = BaseSecretSyncSchema(SecretSync.Koyeb, KoyebSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Koyeb),
    destinationConfig: KoyebSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Koyeb] }));

export const CreateKoyebSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Koyeb,
  KoyebSyncOptionsConfig
).extend({
  destinationConfig: KoyebSyncDestinationConfigSchema
});

export const UpdateKoyebSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Koyeb,
  KoyebSyncOptionsConfig
).extend({
  destinationConfig: KoyebSyncDestinationConfigSchema.optional()
});

export const KoyebSyncListItemSchema = z
  .object({
    name: z.literal("Koyeb"),
    connection: z.literal(AppConnection.Koyeb),
    destination: z.literal(SecretSync.Koyeb),
    canImportSecrets: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Koyeb] }));
