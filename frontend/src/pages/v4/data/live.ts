import type { V4Adapters } from "./adapters";
import { integrationsLive } from "./integrations/live";
import { kmsLive } from "./kms/live";
import { secretScanningLive } from "./secret-scanning/live";

export const liveAdapters: V4Adapters = {
  kms: kmsLive,
  integrations: integrationsLive,
  secretScanning: secretScanningLive
};
