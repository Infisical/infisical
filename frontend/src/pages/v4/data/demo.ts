import { accessApprovalsDemo } from "./access-approvals/demo";
import { accessDemo } from "./access/demo";
import type { V4Adapters } from "./adapters";
import { adminDemo } from "./admin/demo";
import { agentVaultResourcesDemo } from "./agent-vault-resources/demo";
import { agentVaultSettingsDemo } from "./agent-vault-settings/demo";
import { agentVaultDemo } from "./agent-vault/demo";
import { appConnectionsDemo } from "./app-connections/demo";
import { approvalPoliciesDemo } from "./approval-policies/demo";
import { approvalRequestsDemo } from "./approval-requests/demo";
import { auditLogsDemo } from "./audit-logs/demo";
import { billingDemo } from "./billing/demo";
import { certManagerSettingsDemo } from "./cert-manager-settings/demo";
import { certificateAuthoritiesDemo } from "./certificate-authorities/demo";
import { certificatesDemo } from "./certificates/demo";
import { codeSigningDemo } from "./code-signing/demo";
import { hsmConnectorsDemo } from "./hsm-connectors/demo";
import { integrationsDemo } from "./integrations/demo";
import { kmipDemo } from "./kmip/demo";
import { kmsDemo } from "./kms/demo";
import { networkingDemo } from "./networking/demo";
import { orgSettingsDemo } from "./org-settings/demo";
import { orgDemo } from "./org/demo";
import { pamAccessDemo } from "./pam-access/demo";
import { pamDemo } from "./pam/demo";
import { pkiApplicationsDemo } from "./pki-applications/demo";
import { pkiDiscoveryDemo } from "./pki-discovery/demo";
import { pkiPoliciesDemo } from "./pki-policies/demo";
import { pkiSyncsDemo } from "./pki-syncs/demo";
import { productSettingsDemo } from "./product-settings/demo";
import { projectEnvironmentsDemo } from "./project-environments/demo";
import { projectIntegrationsDemo } from "./project-integrations/demo";
import { projectSettingsDemo } from "./project-settings/demo";
import { projectTagsDemo } from "./project-tags/demo";
import { projectsDemo } from "./projects/demo";
import { secretInsightsDemo } from "./secret-insights/demo";
import { secretPoliciesDemo } from "./secret-policies/demo";
import { secretScanningDemo } from "./secret-scanning/demo";
import { secretSharingDemo } from "./secret-sharing/demo";
import { secretsDemo } from "./secrets/demo";
import { ssoDemo } from "./sso/demo";

export const demoAdapters: V4Adapters = {
  agentVault: agentVaultDemo,
  agentVaultSettings: agentVaultSettingsDemo,
  kms: kmsDemo,
  kmip: kmipDemo,
  org: orgDemo,
  integrations: integrationsDemo,
  networking: networkingDemo,
  secretScanning: secretScanningDemo,
  secretSharing: secretSharingDemo,
  secrets: secretsDemo,
  certificates: certificatesDemo,
  certManagerSettings: certManagerSettingsDemo,
  access: accessDemo,
  accessApprovals: accessApprovalsDemo,
  projects: projectsDemo,
  projectSettings: projectSettingsDemo,
  projectIntegrations: projectIntegrationsDemo,
  projectEnvironments: projectEnvironmentsDemo,
  projectTags: projectTagsDemo,
  pam: pamDemo,
  auditLogs: auditLogsDemo,
  admin: adminDemo,
  secretPolicies: secretPoliciesDemo,
  approvalPolicies: approvalPoliciesDemo,
  billing: billingDemo,
  sso: ssoDemo,
  approvalRequests: approvalRequestsDemo,
  pkiApplications: pkiApplicationsDemo,
  certificateAuthorities: certificateAuthoritiesDemo,
  hsmConnectors: hsmConnectorsDemo,
  pkiPolicies: pkiPoliciesDemo,
  pkiDiscovery: pkiDiscoveryDemo,
  codeSigning: codeSigningDemo,
  pkiSyncs: pkiSyncsDemo,
  orgSettings: orgSettingsDemo,
  productSettings: productSettingsDemo,
  agentVaultResources: agentVaultResourcesDemo,
  appConnections: appConnectionsDemo,
  secretInsights: secretInsightsDemo,
  pamAccess: pamAccessDemo
};
