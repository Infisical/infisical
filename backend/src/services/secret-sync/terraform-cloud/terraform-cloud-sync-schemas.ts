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
import { TerraformCloudSyncScope } from "@app/services/secret-sync/terraform-cloud/terraform-cloud-sync-enums";

const TerraformCloudSyncDestinationConfigSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal(TerraformCloudSyncScope.Project).describe(SecretSyncs.DESTINATION_CONFIG.TERRAFORM_CLOUD.scope),
    org: z.string().min(1, "Org ID is required").describe(SecretSyncs.DESTINATION_CONFIG.TERRAFORM_CLOUD.org),
    project: z
      .string()
      .min(1, "Project ID is required")
      .describe(SecretSyncs.DESTINATION_CONFIG.TERRAFORM_CLOUD.project)
  }),
  z.object({
    scope: z.literal(TerraformCloudSyncScope.Workspace).describe(SecretSyncs.DESTINATION_CONFIG.TERRAFORM_CLOUD.scope),
    org: z.string().min(1, "Org ID is required").describe(SecretSyncs.DESTINATION_CONFIG.TERRAFORM_CLOUD.org),
    workspace: z
      .string()
      .min(1, "Workspace ID is required")
      .describe(SecretSyncs.DESTINATION_CONFIG.TERRAFORM_CLOUD.workspace)
  })
]);

const TerraformCloudSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const TerraformCloudSyncSchema = BaseSecretSyncSchema(
  SecretSync.TerraformCloud,
  TerraformCloudSyncOptionsConfig
).extend({
  destination: z.literal(SecretSync.TerraformCloud),
  destinationConfig: TerraformCloudSyncDestinationConfigSchema
});

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

export const TerraformCloudSyncListItemSchema = z.object({
  name: z.literal("Terraform Cloud"),
  connection: z.literal(AppConnection.TerraformCloud),
  destination: z.literal(SecretSync.TerraformCloud),
  canImportSecrets: z.literal(false)
});
