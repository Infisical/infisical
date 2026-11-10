import { accessLive } from "./access/live";
import type { V4Adapters } from "./adapters";
import { agentVaultSettingsLive } from "./agent-vault-settings/live";
import { agentVaultLive } from "./agent-vault/live";
import { certManagerSettingsLive } from "./cert-manager-settings/live";
import { certificatesLive } from "./certificates/live";
import { integrationsLive } from "./integrations/live";
import { kmsLive } from "./kms/live";
import { orgLive } from "./org/live";
import { pamLive } from "./pam/live";
import { projectEnvironmentsLive } from "./project-environments/live";
import { projectIntegrationsLive } from "./project-integrations/live";
import { projectSettingsLive } from "./project-settings/live";
import { projectTagsLive } from "./project-tags/live";
import { projectsLive } from "./projects/live";
import { secretPoliciesLive } from "./secret-policies/live";
import { secretScanningLive } from "./secret-scanning/live";
import { secretsLive } from "./secrets/live";

export const liveAdapters: V4Adapters = {
  agentVault: agentVaultLive,
  agentVaultSettings: agentVaultSettingsLive,
  kms: kmsLive,
  org: orgLive,
  integrations: integrationsLive,
  secretScanning: secretScanningLive,
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
  secretPolicies: secretPoliciesLive
};
