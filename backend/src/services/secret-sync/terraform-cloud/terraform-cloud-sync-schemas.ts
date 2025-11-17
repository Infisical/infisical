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
import {
  TerraformCloudSyncCategory,
  TerraformCloudSyncScope
} from "@app/services/secret-sync/terraform-cloud/terraform-cloud-sync-enums";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

const TerraformCloudSyncDestinationConfigSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z
      .literal(TerraformCloudSyncScope.VariableSet)
      .describe(SecretSyncs.DESTINATION_CONFIG.TERRAFORM_CLOUD.scope),
    org: z.string().min(1, "Org ID is required").describe(SecretSyncs.DESTINATION_CONFIG.TERRAFORM_CLOUD.org),
    variableSetName: z
      .string()
      .min(1, "Variable set name is required")
      .describe(SecretSyncs.DESTINATION_CONFIG.TERRAFORM_CLOUD.variableSetName),
    variableSetId: z
      .string()
      .min(1, "Variable set ID is required")
      .describe(SecretSyncs.DESTINATION_CONFIG.TERRAFORM_CLOUD.variableSetId),
    category: z.nativeEnum(TerraformCloudSyncCategory).describe(SecretSyncs.DESTINATION_CONFIG.TERRAFORM_CLOUD.category)
  }),
  z.object({
    scope: z.literal(TerraformCloudSyncScope.Workspace).describe(SecretSyncs.DESTINATION_CONFIG.TERRAFORM_CLOUD.scope),
    org: z.string().min(1, "Org ID is required").describe(SecretSyncs.DESTINATION_CONFIG.TERRAFORM_CLOUD.org),
    workspaceName: z
      .string()
      .min(1, "Workspace name is required")
      .describe(SecretSyncs.DESTINATION_CONFIG.TERRAFORM_CLOUD.workspaceName),
    workspaceId: z
      .string()
      .min(1, "Workspace ID is required")
      .describe(SecretSyncs.DESTINATION_CONFIG.TERRAFORM_CLOUD.workspaceId),
    category: z.nativeEnum(TerraformCloudSyncCategory).describe(SecretSyncs.DESTINATION_CONFIG.TERRAFORM_CLOUD.category)
  })
]);

const TerraformCloudSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const TerraformCloudSyncSchema = BaseSecretSyncSchema(SecretSync.TerraformCloud, TerraformCloudSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.TerraformCloud),
    destinationConfig: TerraformCloudSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.TerraformCloud] }));

export const CreateTerraformCloudSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.TerraformCloud,
  TerraformCloudSyncOptionsConfig
).extend({
  destinationConfig: TerraformCloudSyncDestinationConfigSchema
});

export const UpdateTerraformCloudSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.TerraformCloud,
  TerraformCloudSyncOptionsConfig
).extend({
  destinationConfig: TerraformCloudSyncDestinationConfigSchema.optional()
});

export const TerraformCloudSyncListItemSchema = z
  .object({
    name: z.literal("Terraform Cloud"),
    connection: z.literal(AppConnection.TerraformCloud),
    destination: z.literal(SecretSync.TerraformCloud),
    canImportSecrets: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.TerraformCloud] }));
