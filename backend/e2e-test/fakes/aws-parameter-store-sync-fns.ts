import { TAwsParameterStoreSyncWithCredentials } from "@app/services/secret-sync/aws-parameter-store/aws-parameter-store-sync-types";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

// Type-only, and by a path the aliases do not match, so this does not resolve back to here.
import type * as RealProvider from "../../src/services/secret-sync/aws-parameter-store/aws-parameter-store-sync-fns";

// Stands in for the AWS Parameter Store provider so the specs can assert what Infisical hands
// to a destination without reaching AWS. Wired up by test.alias in vitest.e2e.config.mts;
// nothing under src/ references this file.
//
// The reconciliation rules below are copied from the real module
// (aws-parameter-store-sync-fns.ts:356-479). They are the behavior under test, so a fake that
// only recorded its input would let a deletion or key schema regression pass unnoticed.

type TFakeStore = {
  secrets: Record<string, string>;
  writeError: string | null;
  runCount: number;
};

// The state hangs off globalThis rather than module scope on purpose. The alias makes this
// module reachable by more than one specifier (the server reaches it through the barrel's
// relative import, a spec through its own path), and the bundler then instantiates it twice:
// the sync writes to one copy of the store while the spec reads an empty other one, and the
// only symptom is an assertion that never comes true. Sharing through globalThis makes that
// impossible, and matches how the harness already shares testServer and testDb.
const globalScope = globalThis as typeof globalThis & {
  infisicalFakeParameterStore?: Map<string, TFakeStore>;
};

globalScope.infisicalFakeParameterStore ??= new Map<string, TFakeStore>();

const stores = globalScope.infisicalFakeParameterStore;

const storeKeyFor = (region: string, path: string) => `${region}|${path}`;

const storeFor = (region: string, path: string): TFakeStore => {
  const key = storeKeyFor(region, path);
  let store = stores.get(key);

  if (!store) {
    store = { secrets: {}, writeError: null, runCount: 0 };
    stores.set(key, store);
  }

  return store;
};

const storeForSync = (secretSync: TAwsParameterStoreSyncWithCredentials) =>
  storeFor(secretSync.destinationConfig.region, secretSync.destinationConfig.path);

// Behavior a spec can change. Everything resets between test files, so a spec never inherits
// another's state or configuration. See e2e-test/setup/reset-fakes.ts.
export const fakeParameterStore = {
  reset: () => {
    stores.clear();
  },

  // A destination is addressed by the region and path the spec passes as destinationConfig
  // when it creates the sync, so it can be seeded before the sync exists.
  at: (region: string, path: string) => ({
    // Secrets already sitting at the destination before Infisical touches it.
    seed: (secrets: Record<string, string>) => {
      Object.assign(storeFor(region, path).secrets, secrets);
    },

    // What the destination holds now.
    read: (): Record<string, string> => ({ ...storeFor(region, path).secrets }),

    // Make every write fail, as a destination rejecting the request would.
    // Pass null to go back to accepting.
    rejectWritesWith: (message: string | null) => {
      storeFor(region, path).writeError = message;
    },

    // How many sync runs have reached this destination. Lets a spec assert that a change
    // did *not* trigger a run, which absence of a secret cannot prove on its own.
    runCount: (): number => storeFor(region, path).runCount
  })
};

export const AwsParameterStoreSyncFns = {
  syncSecrets: (secretSync: TAwsParameterStoreSyncWithCredentials, secretMap: TSecretMap) => {
    const { syncOptions, environment } = secretSync;
    const store = storeForSync(secretSync);

    store.runCount += 1;

    if (store.writeError) {
      throw new SecretSyncError({ message: store.writeError, shouldRetry: false });
    }

    const createdSecretKeys: string[] = [];
    const updatedSecretKeys: string[] = [];
    const deletedSecretKeys: string[] = [];

    for (const [key, { value }] of Object.entries(secretMap)) {
      // AWS rejects an empty parameter value, so the real module skips the write and lets the
      // deletion pass below remove the key instead.
      // eslint-disable-next-line no-continue
      if (!value) continue;

      if (Object.hasOwn(store.secrets, key)) {
        if (store.secrets[key] !== value) updatedSecretKeys.push(key);
      } else {
        createdSecretKeys.push(key);
      }

      store.secrets[key] = value;
    }

    if (syncOptions.disableSecretDeletion) {
      return Promise.resolve({ createdSecretKeys, updatedSecretKeys, deletedSecretKeys });
    }

    for (const key of Object.keys(store.secrets)) {
      // eslint-disable-next-line no-continue
      if (!matchesSchema(key, environment?.slug || "", syncOptions.keySchema)) continue;

      // The real module deletes a key that is absent from the map *or* present with an empty
      // value, so an emptied secret does not linger at the destination.
      if (!Object.hasOwn(secretMap, key) || !secretMap[key].value) {
        delete store.secrets[key];
        deletedSecretKeys.push(key);
      }
    }

    return Promise.resolve({ createdSecretKeys, updatedSecretKeys, deletedSecretKeys });
  },

  // Returns the destination as it stands. Key schema filtering and stripping is the caller's
  // job (secret-sync-fns.ts:643-645), so doing it here too would hide a bug in that wrapper.
  getSecrets: (secretSync: TAwsParameterStoreSyncWithCredentials): Promise<TSecretMap> =>
    Promise.resolve(
      Object.fromEntries(Object.entries(storeForSync(secretSync).secrets).map(([key, value]) => [key, { value }]))
    ),

  removeSecrets: (secretSync: TAwsParameterStoreSyncWithCredentials, secretMap: TSecretMap) => {
    const store = storeForSync(secretSync);

    if (store.writeError) {
      throw new SecretSyncError({ message: store.writeError, shouldRetry: false });
    }

    for (const key of Object.keys(store.secrets)) {
      if (Object.hasOwn(secretMap, key)) delete store.secrets[key];
    }

    return Promise.resolve();
  }
};

// Nothing forces a module replaced by an alias to match the module it replaces, so a signature
// change in the real provider would otherwise leave this fake quietly wrong. This assignment
// fails type-checking instead.
export const assertFakeMatchesRealProvider: Pick<typeof RealProvider, "AwsParameterStoreSyncFns"> = {
  AwsParameterStoreSyncFns
};
