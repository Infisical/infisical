import type { V4Adapters } from "./adapters";
import { kmsLive } from "./kms/live";

export const liveAdapters: V4Adapters = { kms: kmsLive };
