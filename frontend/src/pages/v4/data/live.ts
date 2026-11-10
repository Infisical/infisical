import { accessLive } from "./access/live";
import type { V4Adapters } from "./adapters";
import { adminLive } from "./admin/live";
import { agentVaultSettingsLive } from "./agent-vault-settings/live";
import { agentVaultLive } from "./agent-vault/live";
import { billingLive } from "./billing/live";
import { certManagerSettingsLive } from "./cert-manager-settings/live";
import { certificatesLive } from "./certificates/live";
import { integrationsLive } from "./integrations/live";
import { kmipLive } from "./kmip/live";
import { kmsLive } from "./kms/live";
import { networkingLive } from "./networking/live";
import { orgLive } from "./org/live";
import { pamLive } from "./pam/live";
import { projectEnvironmentsLive } from "./project-environments/live";
import { projectIntegrationsLive } from "./project-integrations/live";
import { projectSettingsLive } from "./project-settings/live";
import { projectTagsLive } from "./project-tags/live";
import { projectsLive } from "./projects/live";
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
  projects: projectsLive,
  projectSettings: projectSettingsLive,
  projectIntegrations: projectIntegrationsLive,
  projectEnvironments: projectEnvironmentsLive,
  projectTags: projectTagsLive,
  pam: pamLive,
  admin: adminLive,
  secretPolicies: secretPoliciesLive,
  billing: billingLive,
  sso: ssoLive
};
