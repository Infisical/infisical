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

import { RenderSyncScope, RenderSyncType } from "./render-sync-enums";

const RenderSyncDestinationConfigSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal(RenderSyncScope.Service).describe(SecretSyncs.DESTINATION_CONFIG.RENDER.scope),
    serviceId: z.string().min(1, "Service ID is required").describe(SecretSyncs.DESTINATION_CONFIG.RENDER.serviceId),
    type: z.nativeEnum(RenderSyncType).describe(SecretSyncs.DESTINATION_CONFIG.RENDER.type)
  })
]);

const RenderSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const RenderSyncSchema = BaseSecretSyncSchema(SecretSync.Render, RenderSyncOptionsConfig).extend({
  destination: z.literal(SecretSync.Render),
  destinationConfig: RenderSyncDestinationConfigSchema
});

export const CreateRenderSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Render,
  RenderSyncOptionsConfig
).extend({
  destinationConfig: RenderSyncDestinationConfigSchema
});

export const UpdateRenderSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Render,
  RenderSyncOptionsConfig
).extend({
  destinationConfig: RenderSyncDestinationConfigSchema.optional()
});

export const RenderSyncListItemSchema = z.object({
  name: z.literal("Render"),
  connection: z.literal(AppConnection.Render),
  destination: z.literal(SecretSync.Render),
  canImportSecrets: z.literal(true)
});
