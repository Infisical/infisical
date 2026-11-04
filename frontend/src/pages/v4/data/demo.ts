import type { V4Adapters } from "./adapters";
import { integrationsDemo } from "./integrations/demo";
import { kmsDemo } from "./kms/demo";
import { secretScanningDemo } from "./secret-scanning/demo";

export const demoAdapters: V4Adapters = {
  kms: kmsDemo,
  integrations: integrationsDemo,
  secretScanning: secretScanningDemo
};
