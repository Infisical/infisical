import { accessLive } from "./access/live";
import type { V4Adapters } from "./adapters";
import { agentVaultLive } from "./agent-vault/live";
import { billingLive } from "./billing/live";
import { certificatesLive } from "./certificates/live";
import { integrationsLive } from "./integrations/live";
import { kmipLive } from "./kmip/live";
import { kmsLive } from "./kms/live";
import { orgLive } from "./org/live";
import { pamLive } from "./pam/live";
import { projectsLive } from "./projects/live";
import { secretScanningLive } from "./secret-scanning/live";
import { secretsLive } from "./secrets/live";
import { ssoLive } from "./sso/live";

export const liveAdapters: V4Adapters = {
  agentVault: agentVaultLive,
  kms: kmsLive,
  kmip: kmipLive,
  org: orgLive,
  integrations: integrationsLive,
  secretScanning: secretScanningLive,
  secrets: secretsLive,
  certificates: certificatesLive,
  access: accessLive,
  projects: projectsLive,
  pam: pamLive,
  billing: billingLive,
  sso: ssoLive
};
