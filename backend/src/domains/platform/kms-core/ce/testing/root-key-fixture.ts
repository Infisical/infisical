import { RuleViolationError } from "@app/domains/lib/errors";

import { TRootKeyWrapper } from "../services/dependencies";
import { loadRootKey, TLoadRootKeyDeps } from "../services/root-key/load-root-key";
import { KmsRootKeyService, TKmsCoreEnv } from "../services/root-key/service";
import { InMemoryKmsCoreStores } from "./in-memory-kms-core-stores";

// The throwaway key the integration template database was wrapped with. Test data, never a default.
export const ROOT_KEY_TEST_ENCRYPTION_KEY = "4bnfe4e407b8921c104518903515b218";

export const rootKeyTestEnv = (overrides: Partial<TKmsCoreEnv> = {}): TKmsCoreEnv => ({
  ENCRYPTION_KEY: ROOT_KEY_TEST_ENCRYPTION_KEY,
  ROOT_ENCRYPTION_KEY: undefined,
  KMS_ROOT_KEY_RETENTION_DAYS: 30,
  isHsmConfigured: false,
  ...overrides
});

// `configured` is read on every call, so a test can bootstrap in software and then attach the device.
export const fakeHsm = ({
  entitled,
  configured = { value: true }
}: {
  entitled: boolean;
  configured?: { value: boolean };
}): TRootKeyWrapper => ({
  isConfigured: async () => configured.value,
  assertEntitled: () => {
    if (!entitled) {
      throw new RuleViolationError({
        message: "Your license does not include HSM integration. Please upgrade to the Enterprise plan to use HSM."
      });
    }
  },
  randomBytes: async (length) => Buffer.alloc(length, 7),
  wrap: async (key) => Buffer.from(key).reverse(),
  unwrap: async (wrapped) => Buffer.from(wrapped).reverse()
});

// Boots an in-memory instance the way the module does: load the root key once, then build the service around it.
export const bootRootKeyService = async ({
  env: envOverrides,
  rootKeyWrapper,
  isFipsEnabled = () => false
}: { env?: Partial<TKmsCoreEnv>; rootKeyWrapper?: TRootKeyWrapper; isFipsEnabled?: () => boolean } = {}) => {
  const memory = new InMemoryKmsCoreStores();
  const env = rootKeyTestEnv(envOverrides);
  const deps: TLoadRootKeyDeps = {
    transactionRunner: memory.transactionRunner,
    stores: memory.stores,
    env,
    isFipsEnabled,
    rootKeyWrapper
  };
  const rootKey = await loadRootKey(deps);
  const service = new KmsRootKeyService(memory.transactionRunner, rootKey, env, isFipsEnabled, rootKeyWrapper);
  return { memory, service, rootKey };
};
