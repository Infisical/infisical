import RE2 from "re2";
import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { CoolifyResourceType } from "@app/services/app-connection/coolify/coolify-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { CoolifySyncScope } from "./coolify-sync-enums";

const CoolifySyncDestinationConfigSchema = z
  .object({
    resourceType: z.nativeEnum(CoolifyResourceType).describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.resourceType),
    resourceId: z
      .string()
      .trim()
      .min(1, "Resource required")
      .max(255)
      .regex(new RE2(/^[A-Za-z0-9_-]+$/), "Resource ID can only contain letters, numbers, underscores and hyphens")
      .describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.resourceId),
    resourceName: z
      .string()
      .trim()
      .min(1, "Resource name required")
      .max(255)
      .describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.resourceName),
    scope: z
      .nativeEnum(CoolifySyncScope)
      .default(CoolifySyncScope.Production)
      .describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.scope)
  })
  .refine(
    ({ resourceType, scope }) =>
      scope === CoolifySyncScope.Production || resourceType === CoolifyResourceType.Application,
    { message: "Only applications have preview deployment variables", path: ["scope"] }
  );

const CoolifySyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const CoolifySyncSchema = BaseSecretSyncSchema(SecretSync.Coolify, CoolifySyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Coolify),
    destinationConfig: CoolifySyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Coolify] }));

export const CreateCoolifySyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Coolify,
  CoolifySyncOptionsConfig
).extend({
  destinationConfig: CoolifySyncDestinationConfigSchema
});

export const UpdateCoolifySyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Coolify,
  CoolifySyncOptionsConfig
).extend({
  destinationConfig: CoolifySyncDestinationConfigSchema.optional()
});

export const CoolifySyncListItemSchema = z
  .object({
    name: z.literal("Coolify"),
    connection: z.literal(AppConnection.Coolify),
    destination: z.literal(SecretSync.Coolify),
    canImportSecrets: z.literal(true),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Coolify] }));
