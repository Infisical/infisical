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

export const DBT_PERMISSION_SET_MAP: Record<
  DbtPermissionsSet,
  {
    label: string;
    isEnterpriseOnly: boolean;
  }
> = {
  [DbtPermissionsSet.AccountAdmin]: {
    label: "Account Admin",
    isEnterpriseOnly: false
  },
  [DbtPermissionsSet.JobAdmin]: {
    label: "Job Admin",
    isEnterpriseOnly: false
  },

  [DbtPermissionsSet.Member]: {
    label: "Member",
    isEnterpriseOnly: false
  },

  [DbtPermissionsSet.MetadataOnly]: {
    label: "Metadata Only",
    isEnterpriseOnly: false
  },
  [DbtPermissionsSet.Readonly]: {
    label: "Readonly",
    isEnterpriseOnly: false
  },
  [DbtPermissionsSet.SemanticLayerOnly]: {
    label: "Semantic Layer Only",
    isEnterpriseOnly: false
  },

  [DbtPermissionsSet.Owner]: {
    label: "Owner",
    isEnterpriseOnly: true
  },

  [DbtPermissionsSet.AccountViewer]: {
    label: "Account Viewer",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.Admin]: {
    label: "Admin",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.Analyst]: {
    label: "Analyst",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.BillingAdmin]: {
    label: "Billing Admin",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.CostInsightsAdmin]: {
    label: "Cost Insights Admin",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.ConstInsightViewer]: {
    label: "Cost Insights Viewer",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.CostManagementAdmin]: {
    label: "Cost Management Admin",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.CostManagementViewer]: {
    label: "Cost Management Viewer",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.DatabaseAdmin]: {
    label: "Database Admin",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.Developer]: {
    label: "Developer",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.FusionAdmin]: {
    label: "Fusion Admin",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.GitAdmin]: {
    label: "Git Admin",
    isEnterpriseOnly: true
  },

  [DbtPermissionsSet.JobRunner]: {
    label: "Job Runner",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.JobViewer]: {
    label: "Job Viewer",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.ManageMarketplaceApps]: {
    label: "Manage Marketplace Apps",
    isEnterpriseOnly: true
  },

  [DbtPermissionsSet.ProjectCreator]: {
    label: "Project Creator",
    isEnterpriseOnly: true
  },

  [DbtPermissionsSet.ScimOnly]: {
    label: "SCIM Only",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.SecurityAdmin]: {
    label: "Security Admin",
    isEnterpriseOnly: true
  },

  [DbtPermissionsSet.Stakeholder]: {
    label: "Stakeholder",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.TeamAdmin]: {
    label: "Team Admin",
    isEnterpriseOnly: true
  },
  [DbtPermissionsSet.WebhooksOnly]: {
    label: "Webhooks Only",
    isEnterpriseOnly: true
  }
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
