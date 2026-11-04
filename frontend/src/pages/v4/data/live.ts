import type { V4Adapters } from "./adapters";
import { certificatesLive } from "./certificates/live";
import { integrationsLive } from "./integrations/live";
import { kmsLive } from "./kms/live";
import { orgLive } from "./org/live";
import { secretScanningLive } from "./secret-scanning/live";
import { secretsLive } from "./secrets/live";

export const liveAdapters: V4Adapters = {
  kms: kmsLive,
  org: orgLive,
  integrations: integrationsLive,
  secretScanning: secretScanningLive,
  secrets: secretsLive,
  certificates: certificatesLive
};
