import { TFeatureMapping } from "../dual-read-types";

export const coreMappings: TFeatureMapping[] = [
  {
    v2Key: "secret_versioning",
    v1Field: "secretVersioning",
    extractV1: (p) => p.secretVersioning
  },
  {
    v2Key: "pit_recovery",
    v1Field: "pitRecovery",
    extractV1: (p) => p.pitRecovery
  },
  {
    v2Key: "dynamic_secret",
    v1Field: "dynamicSecret",
    extractV1: (p) => p.dynamicSecret
  },
  {
    v2Key: "sub_organization",
    v1Field: "subOrganization",
    extractV1: (p) => p.subOrganization
  },
  {
    v2Key: "secret_approval",
    v1Field: "secretApproval",
    extractV1: (p) => p.secretApproval
  },
  {
    v2Key: "secret_rotation",
    v1Field: "secretRotation",
    extractV1: (p) => p.secretRotation
  },
  {
    v2Key: "secret_access_insights",
    v1Field: "secretAccessInsights",
    extractV1: (p) => p.secretAccessInsights
  },
  {
    v2Key: "project_templates",
    v1Field: "projectTemplates",
    extractV1: (p) => p.projectTemplates
  },
  {
    v2Key: "event_subscriptions",
    v1Field: "eventSubscriptions",
    extractV1: (p) => p.eventSubscriptions
  },
  {
    v2Key: "pam_slack_notifications",
    v1Field: "pamSlackNotifications",
    extractV1: (p) => p.pamSlackNotifications
  },
  {
    v2Key: "machine_identity_auth_templates",
    v1Field: "machineIdentityAuthTemplates",
    extractV1: (p) => p.machineIdentityAuthTemplates
  },
  {
    v2Key: "secret_share_external_branding",
    v1Field: "secretShareExternalBranding",
    extractV1: (p) => p.secretShareExternalBranding
  },
  {
    v2Key: "instance_user_management",
    v1Field: "instanceUserManagement",
    extractV1: (p) => p.instanceUserManagement
  },
  {
    v2Key: "secret_scanning",
    v1Field: "secretScanning",
    extractV1: (p) => p.secretScanning
  },
  {
    v2Key: "enterprise_secret_syncs",
    v1Field: "enterpriseSecretSyncs",
    extractV1: (p) => p.enterpriseSecretSyncs
  },
  {
    v2Key: "enterprise_app_connections",
    v1Field: "enterpriseAppConnections",
    extractV1: (p) => p.enterpriseAppConnections
  },
  {
    v2Key: "pam",
    v1Field: "pam",
    extractV1: (p) => p.pam
  },
  {
    v2Key: "cert_manager",
    v1Field: "certManager",
    extractV1: (p) => p.certManager
  }
];
