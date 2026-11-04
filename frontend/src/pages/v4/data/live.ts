import type { V4Adapters } from "./adapters";
import { kmsLive } from "./kms/live";
import { orgLive } from "./org/live";

export const liveAdapters: V4Adapters = { kms: kmsLive, org: orgLive };
