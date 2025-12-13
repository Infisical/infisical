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

export enum OctopusDeploySyncScope {
  Project = "project"
}

const OctopusDeploySyncDestinationConfigBaseSchema = z.object({
  spaceId: z.string().min(1, "Space ID is required").describe(SecretSyncs.DESTINATION_CONFIG.OCTOPUS_DEPLOY.spaceId),
  spaceName: z.string().optional().describe(SecretSyncs.DESTINATION_CONFIG.OCTOPUS_DEPLOY.spaceName),
  scope: z.nativeEnum(OctopusDeploySyncScope).default(OctopusDeploySyncScope.Project)
});

export const OctopusDeploySyncDestinationConfigSchema = z.intersection(
  OctopusDeploySyncDestinationConfigBaseSchema,
  z.discriminatedUnion("scope", [
    z.object({
      scope: z.literal(OctopusDeploySyncScope.Project),
      projectId: z
        .string()
        .min(1, "Project ID is required")
        .describe(SecretSyncs.DESTINATION_CONFIG.OCTOPUS_DEPLOY.projectId),
      projectName: z.string().optional().describe(SecretSyncs.DESTINATION_CONFIG.OCTOPUS_DEPLOY.projectName),
      scopeValues: z
        .object({
          environments: z.array(z.string()).optional(),
          roles: z.array(z.string()).optional(),
          machines: z.array(z.string()).optional(),
          processes: z.array(z.string()).optional(),
          actions: z.array(z.string()).optional(),
          channels: z.array(z.string()).optional()
        })
        .optional()
        .describe(SecretSyncs.DESTINATION_CONFIG.OCTOPUS_DEPLOY.scopeValues)
    })
  ])
);

const OctopusDeploySyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const OctopusDeploySyncSchema = BaseSecretSyncSchema(SecretSync.OctopusDeploy, OctopusDeploySyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.OctopusDeploy),
    destinationConfig: OctopusDeploySyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.OctopusDeploy] }));

export const CreateOctopusDeploySyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.OctopusDeploy,
  OctopusDeploySyncOptionsConfig
).extend({
  destinationConfig: OctopusDeploySyncDestinationConfigSchema
});

export const UpdateOctopusDeploySyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.OctopusDeploy,
  OctopusDeploySyncOptionsConfig
).extend({
  destinationConfig: OctopusDeploySyncDestinationConfigSchema.optional()
});

export const OctopusDeploySyncListItemSchema = z
  .object({
    name: z.literal("Octopus Deploy"),
    connection: z.literal(AppConnection.OctopusDeploy),
    destination: z.literal(SecretSync.OctopusDeploy),
    canImportSecrets: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.OctopusDeploy] }));
