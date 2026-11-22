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
import { JenkinsSyncScope } from "./jenkins-sync-enums";

const JenkinsSyncDestinationConfigSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal(JenkinsSyncScope.Global).describe(SecretSyncs.DESTINATION_CONFIG.JENKINS.scope)
  }),
  z.object({
    scope: z.literal(JenkinsSyncScope.Folder).describe(SecretSyncs.DESTINATION_CONFIG.JENKINS.scope),
    folderPath: z
      .string()
      .trim()
      .min(1, "Folder is required")
      .max(255)
      .refine(
        (val) => val.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."),
        "Folder must be a Jenkins folder's full name, such as 'team/app'"
      )
      .describe(SecretSyncs.DESTINATION_CONFIG.JENKINS.folderPath)
  })
]);

const JenkinsSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const JenkinsSyncSchema = BaseSecretSyncSchema(SecretSync.Jenkins, JenkinsSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Jenkins),
    destinationConfig: JenkinsSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Jenkins] }));

export const CreateJenkinsSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Jenkins,
  JenkinsSyncOptionsConfig
).extend({
  destinationConfig: JenkinsSyncDestinationConfigSchema
});

export const UpdateJenkinsSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Jenkins,
  JenkinsSyncOptionsConfig
).extend({
  destinationConfig: JenkinsSyncDestinationConfigSchema.optional()
});

export const JenkinsSyncListItemSchema = z
  .object({
    name: z.literal("Jenkins"),
    connection: z.literal(AppConnection.Jenkins),
    destination: z.literal(SecretSync.Jenkins),
    canImportSecrets: z.literal(false),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Jenkins] }));
