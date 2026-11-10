import { accessDemo } from "./access/demo";
import type { V4Adapters } from "./adapters";
import { agentVaultDemo } from "./agent-vault/demo";
import { certificatesDemo } from "./certificates/demo";
import { integrationsDemo } from "./integrations/demo";
import { kmsDemo } from "./kms/demo";
import { networkingDemo } from "./networking/demo";
import { orgDemo } from "./org/demo";
import { pamDemo } from "./pam/demo";
import { projectsDemo } from "./projects/demo";
import { secretScanningDemo } from "./secret-scanning/demo";
import { secretsDemo } from "./secrets/demo";

export const demoAdapters: V4Adapters = {
  agentVault: agentVaultDemo,
  kms: kmsDemo,
  org: orgDemo,
  integrations: integrationsDemo,
  networking: networkingDemo,
  secretScanning: secretScanningDemo,
  secrets: secretsDemo,
  certificates: certificatesDemo,
  access: accessDemo,
  projects: projectsDemo,
  pam: pamDemo
};
