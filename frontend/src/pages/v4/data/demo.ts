import { accessDemo } from "./access/demo";
import type { V4Adapters } from "./adapters";
import { kmsDemo } from "./kms/demo";

export const demoAdapters: V4Adapters = { kms: kmsDemo, access: accessDemo };
