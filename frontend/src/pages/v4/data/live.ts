import type { V4Adapters } from "./adapters";
import { kmsLive } from "./kms/live";
import { secretsLive } from "./secrets/live";

export const liveAdapters: V4Adapters = {
  kms: kmsLive,
  secrets: secretsLive
};
