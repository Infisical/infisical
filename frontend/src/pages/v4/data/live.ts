import { accessApprovalsLive } from "./access-approvals/live";
import { accessLive } from "./access/live";
import type { V4Adapters } from "./adapters";
import { adminLive } from "./admin/live";
import { agentVaultResourcesLive } from "./agent-vault-resources/live";
import { agentVaultSettingsLive } from "./agent-vault-settings/live";
import { agentVaultLive } from "./agent-vault/live";
import { appConnectionsLive } from "./app-connections/live";
import { approvalPoliciesLive } from "./approval-policies/live";
import { approvalRequestsLive } from "./approval-requests/live";
import { auditLogsLive } from "./audit-logs/live";
import { billingLive } from "./billing/live";
import { certManagerSettingsLive } from "./cert-manager-settings/live";
import { certificateAuthoritiesLive } from "./certificate-authorities/live";
import { certificatesLive } from "./certificates/live";
import { codeSigningLive } from "./code-signing/live";
import { hsmConnectorsLive } from "./hsm-connectors/live";
import { integrationsLive } from "./integrations/live";
import { kmipLive } from "./kmip/live";
import { kmsLive } from "./kms/live";
import { networkingLive } from "./networking/live";
import { orgSettingsLive } from "./org-settings/live";
import { orgLive } from "./org/live";
import { pamAccessLive } from "./pam-access/live";
import { pamLive } from "./pam/live";
import { pkiApplicationsLive } from "./pki-applications/live";
import { pkiDiscoveryLive } from "./pki-discovery/live";
import { pkiPoliciesLive } from "./pki-policies/live";
import { pkiSyncsLive } from "./pki-syncs/live";
import { productSettingsLive } from "./product-settings/live";
import { projectEnvironmentsLive } from "./project-environments/live";
import { projectIntegrationsLive } from "./project-integrations/live";
import { projectSettingsLive } from "./project-settings/live";
import { projectTagsLive } from "./project-tags/live";
import { projectsLive } from "./projects/live";
import { secretInsightsLive } from "./secret-insights/live";
import { secretPoliciesLive } from "./secret-policies/live";
import { secretScanningLive } from "./secret-scanning/live";
import { secretSharingLive } from "./secret-sharing/live";
import { secretsLive } from "./secrets/live";
import { ssoLive } from "./sso/live";

export const liveAdapters: V4Adapters = {
  agentVault: agentVaultLive,
  agentVaultSettings: agentVaultSettingsLive,
  kms: kmsLive,
  kmip: kmipLive,
  org: orgLive,
  integrations: integrationsLive,
  networking: networkingLive,
  secretScanning: secretScanningLive,
  secretSharing: secretSharingLive,
  secrets: secretsLive,
  certificates: certificatesLive,
  certManagerSettings: certManagerSettingsLive,
  access: accessLive,
  accessApprovals: accessApprovalsLive,
  projects: projectsLive,
  projectSettings: projectSettingsLive,
  projectIntegrations: projectIntegrationsLive,
  projectEnvironments: projectEnvironmentsLive,
  projectTags: projectTagsLive,
  pam: pamLive,
  auditLogs: auditLogsLive,
  admin: adminLive,
  secretPolicies: secretPoliciesLive,
  approvalPolicies: approvalPoliciesLive,
  billing: billingLive,
  sso: ssoLive,
  approvalRequests: approvalRequestsLive,
  pkiApplications: pkiApplicationsLive,
  certificateAuthorities: certificateAuthoritiesLive,
  hsmConnectors: hsmConnectorsLive,
  pkiPolicies: pkiPoliciesLive,
  pkiDiscovery: pkiDiscoveryLive,
  codeSigning: codeSigningLive,
  pkiSyncs: pkiSyncsLive,
  orgSettings: orgSettingsLive,
  productSettings: productSettingsLive,
  agentVaultResources: agentVaultResourcesLive,
  appConnections: appConnectionsLive,
  secretInsights: secretInsightsLive,
  pamAccess: pamAccessLive
};
