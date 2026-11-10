import { accessDemo } from "./access/demo";
import type { V4Adapters } from "./adapters";
import { adminDemo } from "./admin/demo";
import { agentVaultDemo } from "./agent-vault/demo";
import { billingDemo } from "./billing/demo";
import { certificatesDemo } from "./certificates/demo";
import { integrationsDemo } from "./integrations/demo";
import { kmsDemo } from "./kms/demo";
import { orgDemo } from "./org/demo";
import { pamDemo } from "./pam/demo";
import { projectsDemo } from "./projects/demo";
import { secretScanningDemo } from "./secret-scanning/demo";
import { secretsDemo } from "./secrets/demo";
import { ssoDemo } from "./sso/demo";

export const demoAdapters: V4Adapters = {
  agentVault: agentVaultDemo,
  kms: kmsDemo,
  org: orgDemo,
  integrations: integrationsDemo,
  secretScanning: secretScanningDemo,
  secrets: secretsDemo,
  certificates: certificatesDemo,
  access: accessDemo,
  projects: projectsDemo,
  pam: pamDemo,
  admin: adminDemo,
  billing: billingDemo,
  sso: ssoDemo
};
