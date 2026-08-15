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

const PortainerSyncDestinationConfigSchema = z.object({
  environmentId: z.number().int().positive("Environment is required"),
  stackId: z.number().int().positive("Stack is required")
});

const PortainerSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const PortainerSyncSchema = BaseSecretSyncSchema(SecretSync.Portainer, PortainerSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Portainer),
    destinationConfig: PortainerSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Portainer] }));

export const CreatePortainerSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Portainer,
  PortainerSyncOptionsConfig
).extend({
  destinationConfig: PortainerSyncDestinationConfigSchema
});

export const UpdatePortainerSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Portainer,
  PortainerSyncOptionsConfig
).extend({
  destinationConfig: PortainerSyncDestinationConfigSchema.optional()
});

export const PortainerSyncListItemSchema = z
  .object({
    name: z.literal("Portainer"),
    connection: z.literal(AppConnection.Portainer),
    destination: z.literal(SecretSync.Portainer),
    canImportSecrets: z.literal(true),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Portainer] }));
