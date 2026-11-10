import { accessLive } from "./access/live";
import type { V4Adapters } from "./adapters";
import { adminLive } from "./admin/live";
import { agentVaultLive } from "./agent-vault/live";
import { certificatesLive } from "./certificates/live";
import { integrationsLive } from "./integrations/live";
import { kmsLive } from "./kms/live";
import { orgLive } from "./org/live";
import { pamLive } from "./pam/live";
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
  access: accessLive,
  projects: projectsLive,
  pam: pamLive,
  admin: adminLive
};
