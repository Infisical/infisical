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
import { RenderSyncScope, RenderSyncType } from "./render-sync-enums";

const RenderSyncDestinationConfigSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal(RenderSyncScope.Service).describe(SecretSyncs.DESTINATION_CONFIG.RENDER.scope),
    serviceId: z.string().min(1, "Service ID is required").describe(SecretSyncs.DESTINATION_CONFIG.RENDER.serviceId),
    type: z.nativeEnum(RenderSyncType).describe(SecretSyncs.DESTINATION_CONFIG.RENDER.type)
  }),
  z.object({
    scope: z.literal(RenderSyncScope.EnvironmentGroup).describe(SecretSyncs.DESTINATION_CONFIG.RENDER.scope),
    environmentGroupId: z
      .string()
      .min(1, "Environment Group ID is required")
      .describe(SecretSyncs.DESTINATION_CONFIG.RENDER.environmentGroupId),
    type: z.nativeEnum(RenderSyncType).describe(SecretSyncs.DESTINATION_CONFIG.RENDER.type)
  })
]);

const RenderSyncOptionsSchema = z.object({
  autoRedeployServices: z.boolean().optional().describe(SecretSyncs.ADDITIONAL_SYNC_OPTIONS.RENDER.autoRedeployServices)
});

const RenderSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const RenderSyncSchema = BaseSecretSyncSchema(
  SecretSync.Render,
  RenderSyncOptionsConfig,
  RenderSyncOptionsSchema
)
  .extend({
    destination: z.literal(SecretSync.Render),
    destinationConfig: RenderSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Render] }));

export const CreateRenderSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Render,
  RenderSyncOptionsConfig,
  RenderSyncOptionsSchema
).extend({
  destinationConfig: RenderSyncDestinationConfigSchema
});

export const UpdateRenderSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Render,
  RenderSyncOptionsConfig,
  RenderSyncOptionsSchema
).extend({
  destinationConfig: RenderSyncDestinationConfigSchema.optional()
});

export const RenderSyncListItemSchema = z
  .object({
    name: z.literal("Render"),
    connection: z.literal(AppConnection.Render),
    destination: z.literal(SecretSync.Render),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Render] }));
