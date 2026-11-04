import { accessDemo } from "./access/demo";
import type { V4Adapters } from "./adapters";
import { certificatesDemo } from "./certificates/demo";
import { integrationsDemo } from "./integrations/demo";
import { kmsDemo } from "./kms/demo";
import { orgDemo } from "./org/demo";
import { secretScanningDemo } from "./secret-scanning/demo";
import { secretsDemo } from "./secrets/demo";

export const demoAdapters: V4Adapters = {
  kms: kmsDemo,
  org: orgDemo,
  integrations: integrationsDemo,
  secretScanning: secretScanningDemo,
  secrets: secretsDemo,
  certificates: certificatesDemo,
  access: accessDemo
};
