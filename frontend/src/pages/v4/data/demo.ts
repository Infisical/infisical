import type { V4Adapters } from "./adapters";
import { kmsDemo } from "./kms/demo";
import { secretsDemo } from "./secrets/demo";

export const demoAdapters: V4Adapters = {
  kms: kmsDemo,
  secrets: secretsDemo
};
