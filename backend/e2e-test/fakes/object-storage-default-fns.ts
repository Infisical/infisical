import type * as RealDefaultStorage from "../../src/services/object-storage/object-storage-default-fns";

// Stands in for the instance's default storage settings, which production reads from OBJECT_STORAGE_S3_* once at
// boot. Specs need both an instance with a bucket and one without, so this lets them switch. Unset by default, so
// specs that never mention default storage behave as on an instance without a bucket. Wired up by test.alias in
// vitest.e2e.config.mts; nothing under src/ references this file.

export const FAKE_DEFAULT_STORAGE: RealDefaultStorage.TDefaultStorage = {
  bucket: "instance-bucket",
  region: "us-east-1",
  prefix: "infisical"
};

type TFakeState = { defaultStorage: RealDefaultStorage.TDefaultStorage | null };

// On globalThis for the same reason as the S3 fake: the server and a spec can reach this module by different
// specifiers, and module state would then split into two copies.
const globalScope = globalThis as typeof globalThis & { infisicalFakeDefaultStorage?: TFakeState };
globalScope.infisicalFakeDefaultStorage ??= { defaultStorage: null };
const state = globalScope.infisicalFakeDefaultStorage;

export const fakeDefaultStorage = {
  set: (defaultStorage: RealDefaultStorage.TDefaultStorage = FAKE_DEFAULT_STORAGE) => {
    state.defaultStorage = defaultStorage;
  },
  unset: () => {
    state.defaultStorage = null;
  },
  reset: () => {
    state.defaultStorage = null;
  }
};

export const getDefaultStorage = () => state.defaultStorage;

export const isDefaultStorageConfigured = () => state.defaultStorage !== null;

export const assertFakeMatchesRealDefaultStorage: Pick<
  typeof RealDefaultStorage,
  "getDefaultStorage" | "isDefaultStorageConfigured"
> = { getDefaultStorage, isDefaultStorageConfigured };
