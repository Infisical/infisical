import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { HumanitecSyncScope } from "@app/services/secret-sync/humanitec/humanitec-sync-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

const HumanitecSyncDestinationConfigSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal(HumanitecSyncScope.Application).describe(SecretSyncs.DESTINATION_CONFIG.HUMANITEC.scope),
    org: z.string().min(1, "Org ID is required").describe(SecretSyncs.DESTINATION_CONFIG.HUMANITEC.org),
    app: z.string().min(1, "App ID is required").describe(SecretSyncs.DESTINATION_CONFIG.HUMANITEC.app)
  }),
  z.object({
    scope: z.literal(HumanitecSyncScope.Environment).describe(SecretSyncs.DESTINATION_CONFIG.HUMANITEC.scope),
    org: z.string().min(1, "Org ID is required").describe(SecretSyncs.DESTINATION_CONFIG.HUMANITEC.org),
    app: z.string().min(1, "App ID is required").describe(SecretSyncs.DESTINATION_CONFIG.HUMANITEC.app),
    env: z.string().min(1, "Env ID is required").describe(SecretSyncs.DESTINATION_CONFIG.HUMANITEC.env)
  })
]);

const HumanitecSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const HumanitecSyncSchema = BaseSecretSyncSchema(SecretSync.Humanitec, HumanitecSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Humanitec),
    destinationConfig: HumanitecSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Humanitec] }));

export const CreateHumanitecSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Humanitec,
  HumanitecSyncOptionsConfig
).extend({
  destinationConfig: HumanitecSyncDestinationConfigSchema
});

export const UpdateHumanitecSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Humanitec,
  HumanitecSyncOptionsConfig
).extend({
  destinationConfig: HumanitecSyncDestinationConfigSchema.optional()
});

export const HumanitecSyncListItemSchema = z
  .object({
    name: z.literal("Humanitec"),
    connection: z.literal(AppConnection.Humanitec),
    destination: z.literal(SecretSync.Humanitec),
    canImportSecrets: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Humanitec] }));
