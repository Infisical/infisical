import { accessDemo } from "./access/demo";
import type { V4Adapters } from "./adapters";
import { agentVaultSettingsDemo } from "./agent-vault-settings/demo";
import { agentVaultDemo } from "./agent-vault/demo";
import { billingDemo } from "./billing/demo";
import { certManagerSettingsDemo } from "./cert-manager-settings/demo";
import { certificatesDemo } from "./certificates/demo";
import { integrationsDemo } from "./integrations/demo";
import { kmsDemo } from "./kms/demo";
import { orgDemo } from "./org/demo";
import { pamDemo } from "./pam/demo";
import { projectEnvironmentsDemo } from "./project-environments/demo";
import { projectIntegrationsDemo } from "./project-integrations/demo";
import { projectSettingsDemo } from "./project-settings/demo";
import { projectTagsDemo } from "./project-tags/demo";
import { projectsDemo } from "./projects/demo";
import { secretPoliciesDemo } from "./secret-policies/demo";
import { secretScanningDemo } from "./secret-scanning/demo";
import { secretsDemo } from "./secrets/demo";
import { ssoDemo } from "./sso/demo";

export const demoAdapters: V4Adapters = {
  agentVault: agentVaultDemo,
  agentVaultSettings: agentVaultSettingsDemo,
  kms: kmsDemo,
  org: orgDemo,
  integrations: integrationsDemo,
  secretScanning: secretScanningDemo,
  secrets: secretsDemo,
  certificates: certificatesDemo,
  certManagerSettings: certManagerSettingsDemo,
  access: accessDemo,
  projects: projectsDemo,
  projectSettings: projectSettingsDemo,
  projectIntegrations: projectIntegrationsDemo,
  projectEnvironments: projectEnvironmentsDemo,
  projectTags: projectTagsDemo,
  pam: pamDemo,
  secretPolicies: secretPoliciesDemo,
  billing: billingDemo,
  sso: ssoDemo
};
