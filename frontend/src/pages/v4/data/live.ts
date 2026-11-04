import type { V4Adapters } from "./adapters";
import { certificatesLive } from "./certificates/live";
import { kmsLive } from "./kms/live";

export const liveAdapters: V4Adapters = { kms: kmsLive, certificates: certificatesLive };
