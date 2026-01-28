import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export enum DbtPermissionsSet {
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

export const DBT_PERMISSION_SET_MAP: Record<DbtPermissionsSet, string> = {
  [DbtPermissionsSet.AccountAdmin]: "Account Admin",
  [DbtPermissionsSet.AccountViewer]: "Account Viewer",
  [DbtPermissionsSet.Admin]: "Admin",
  [DbtPermissionsSet.Analyst]: "Analyst",
  [DbtPermissionsSet.BillingAdmin]: "Billing Admin",
  [DbtPermissionsSet.CostInsightsAdmin]: "Cost Insights Admin",
  [DbtPermissionsSet.ConstInsightViewer]: "Cost Insights Viewer",
  [DbtPermissionsSet.CostManagementAdmin]: "Cost Management Admin",
  [DbtPermissionsSet.CostManagementViewer]: "Cost Management Viewer",
  [DbtPermissionsSet.DatabaseAdmin]: "Database Admin",
  [DbtPermissionsSet.Developer]: "Developer",
  [DbtPermissionsSet.FusionAdmin]: "Fusion Admin",
  [DbtPermissionsSet.GitAdmin]: "Git Admin",
  [DbtPermissionsSet.JobAdmin]: "Job Admin",
  [DbtPermissionsSet.JobRunner]: "Job Runner",
  [DbtPermissionsSet.JobViewer]: "Job Viewer",
  [DbtPermissionsSet.ManageMarketplaceApps]: "Manage Marketplace Apps",
  [DbtPermissionsSet.Member]: "Member",
  [DbtPermissionsSet.MetadataOnly]: "Metadata Only",
  [DbtPermissionsSet.Owner]: "Owner",
  [DbtPermissionsSet.ProjectCreator]: "Project Creator",
  [DbtPermissionsSet.Readonly]: "Readonly",
  [DbtPermissionsSet.ScimOnly]: "SCIM Only",
  [DbtPermissionsSet.SecurityAdmin]: "Security Admin",
  [DbtPermissionsSet.SemanticLayerOnly]: "Semantic Layer Only",
  [DbtPermissionsSet.Stakeholder]: "Stakeholder",
  [DbtPermissionsSet.TeamAdmin]: "Team Admin",
  [DbtPermissionsSet.WebhooksOnly]: "Webhooks Only"
};

export const DbtTokenPermissionsSchema = z.object({
  permissionSet: z.nativeEnum(DbtPermissionsSet),
  projectId: z.number().optional()
});

export const DbtServiceTokenRotationSchema = z
  .object({
    type: z.literal(SecretRotation.DbtServiceToken),
    parameters: z.object({
      permissionGrants: DbtTokenPermissionsSchema.array()
    }),
    secretsMapping: z.object({
      serviceToken: z.string().trim().min(1, "Service Token required")
    })
  })
  .merge(BaseSecretRotationSchema);
