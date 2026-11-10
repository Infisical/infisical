import { accessLive } from "./access/live";
import type { V4Adapters } from "./adapters";
import { agentVaultLive } from "./agent-vault/live";
import { certManagerSettingsLive } from "./cert-manager-settings/live";
import { certificatesLive } from "./certificates/live";
import { integrationsLive } from "./integrations/live";
import { kmsLive } from "./kms/live";
import { orgLive } from "./org/live";
import { pamLive } from "./pam/live";
import { projectSettingsLive } from "./project-settings/live";
import { projectsLive } from "./projects/live";
import { secretScanningLive } from "./secret-scanning/live";
import { secretsLive } from "./secrets/live";

export const liveAdapters: V4Adapters = {
  agentVault: agentVaultLive,
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
  pam: pamLive
};
