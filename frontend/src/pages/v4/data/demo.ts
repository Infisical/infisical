import type { V4Adapters } from "./adapters";
import { kmsDemo } from "./kms/demo";
import { orgDemo } from "./org/demo";

export const demoAdapters: V4Adapters = { kms: kmsDemo, org: orgDemo };
