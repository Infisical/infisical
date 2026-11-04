import type { V4Adapters } from "./adapters";
import { integrationsDemo } from "./integrations/demo";
import { kmsDemo } from "./kms/demo";
import { orgDemo } from "./org/demo";
import { secretScanningDemo } from "./secret-scanning/demo";

export const demoAdapters: V4Adapters = {
  kms: kmsDemo,
  org: orgDemo,
  integrations: integrationsDemo,
  secretScanning: secretScanningDemo
};
