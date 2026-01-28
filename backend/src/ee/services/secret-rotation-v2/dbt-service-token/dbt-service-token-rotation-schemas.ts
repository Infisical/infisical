import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import { SecretRotations } from "@app/lib/api-docs";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

enum DbtPermissionsSet {
  AccountAdmin = "account_admin",
  AccountViewer = "account_viewer",
  Admin = "admin",
  Analyst = "analyst",
  BillingAdmin = "billing_admin",
  CostInsightsAdmin = "cost_insights_admin",
  ConstInsightViewer = "cost_insights_viewer",
  CostManagementAdmin = "cost_management_admin",
  CostManagementViewer = "cost_management_viewer",
  DatabaseAdmin = "database_admin",
  Developer = "developer",
  FusionAdmin = "fusion_admin",
  GitAdmin = "git_admin",
  JobAdmin = "job_admin",
  JobRunner = "job_runner",
  JobViewer = "job_viewer",
  ManageMarketplaceApps = "manage_marketplace_apps",
  Member = "member",
  MetadataOnly = "metadata_only",
  Owner = "owner",
  ProjectCreator = "project_creator",
  Readonly = "readonly",
  ScimOnly = "scim_only",
  SecurityAdmin = "security_admin",
  SemanticLayerOnly = "semantic_layer_only",
  Stakeholder = "stakeholder",
  TeamAdmin = "team_admin",
  WebhooksOnly = "webhooks_only"
}

export const DbtTokenPermissionsSchema = z.object({
  permissionSet: z.nativeEnum(DbtPermissionsSet),
  projectId: z.number().optional()
});

export const DbtServiceTokenRotationGeneratedCredentialsSchema = z
  .object({
    serviceToken: z.string(),
    tokenId: z.number(),
    tokenName: z.string()
  })
  .array()
  .min(1)
  .max(2);

const DbtServiceTokenRotationParametersSchema = z.object({
  permissionGrants: DbtTokenPermissionsSchema.array()
    .min(1)
    .describe(SecretRotations.PARAMETERS.DBT_SERVICE_TOKEN.permissionGrants)
});

const DbtServiceTokenRotationSecretsMappingSchema = z.object({
  serviceToken: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.DBT_SERVICE_TOKEN.serviceToken)
});

export const DbtServiceTokenRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    serviceToken: z.string()
  })
});

export const DbtServiceTokenRotationSchema = BaseSecretRotationSchema(SecretRotation.DbtServiceToken).extend({
  type: z.literal(SecretRotation.DbtServiceToken),
  parameters: DbtServiceTokenRotationParametersSchema,
  secretsMapping: DbtServiceTokenRotationSecretsMappingSchema
});

export const CreateDbtServiceTokenRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.DbtServiceToken
).extend({
  parameters: DbtServiceTokenRotationParametersSchema,
  secretsMapping: DbtServiceTokenRotationSecretsMappingSchema
});

export const UpdateDbtServiceTokenRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.DbtServiceToken
).extend({
  parameters: DbtServiceTokenRotationParametersSchema.optional(),
  secretsMapping: DbtServiceTokenRotationSecretsMappingSchema.optional()
});

export const DbtServiceTokenRotationListItemSchema = z.object({
  name: z.literal("DBT Service Token"),
  connection: z.literal(AppConnection.Dbt),
  type: z.literal(SecretRotation.DbtServiceToken),
  template: DbtServiceTokenRotationTemplateSchema
});
