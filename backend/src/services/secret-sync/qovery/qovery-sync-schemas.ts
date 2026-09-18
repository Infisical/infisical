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
import { QoveryVariableType } from "./qovery-sync-enums";

// The sync scope is derived from `environmentId`: when omitted the sync targets the project,
// otherwise it targets the environment. There is no explicit scope selector.
const QoverySyncDestinationConfigSchema = z.object({
  organizationId: z
    .string()
    .trim()
    .min(1, "Organization required")
    .describe(SecretSyncs.DESTINATION_CONFIG.QOVERY.organizationId),
  organizationName: z.string().trim().optional().describe(SecretSyncs.DESTINATION_CONFIG.QOVERY.organizationName),
  projectId: z.string().trim().min(1, "Project required").describe(SecretSyncs.DESTINATION_CONFIG.QOVERY.projectId),
  projectName: z.string().trim().optional().describe(SecretSyncs.DESTINATION_CONFIG.QOVERY.projectName),
  environmentId: z.string().trim().optional().describe(SecretSyncs.DESTINATION_CONFIG.QOVERY.environmentId),
  environmentName: z.string().trim().optional().describe(SecretSyncs.DESTINATION_CONFIG.QOVERY.environmentName),
  variableType: z
    .nativeEnum(QoveryVariableType)
    .default(QoveryVariableType.Secret)
    .describe(SecretSyncs.DESTINATION_CONFIG.QOVERY.variableType)
});

const QoverySyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const QoverySyncSchema = BaseSecretSyncSchema(SecretSync.Qovery, QoverySyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Qovery),
    destinationConfig: QoverySyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Qovery] }));

export const CreateQoverySyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Qovery,
  QoverySyncOptionsConfig
).extend({
  destinationConfig: QoverySyncDestinationConfigSchema
});

export const UpdateQoverySyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Qovery,
  QoverySyncOptionsConfig
).extend({
  destinationConfig: QoverySyncDestinationConfigSchema.optional()
});

export const QoverySyncListItemSchema = z
  .object({
    name: z.literal("Qovery"),
    connection: z.literal(AppConnection.Qovery),
    destination: z.literal(SecretSync.Qovery),
    canImportSecrets: z.literal(false),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Qovery] }));
