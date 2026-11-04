import type { V4Adapters } from "./adapters";
import { certificatesDemo } from "./certificates/demo";
import { kmsDemo } from "./kms/demo";

export const demoAdapters: V4Adapters = { kms: kmsDemo, certificates: certificatesDemo };
