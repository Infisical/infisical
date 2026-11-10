import { TDomainKeyStore } from "@app/domains/lib/key-store";
import { InMemoryKeyStore } from "@app/domains/lib/testing/in-memory-key-store";
import { TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";
import { FakeKmsCoreDomain } from "@app/domains/platform/kms-core/ce/testing/fake-kms-core-domain";

import { InstanceConfigCoreModule } from "../module";
import { FakeInstanceConfigEnv } from "./fake-instance-config-env";
import { InMemoryInstanceConfigCoreDataAccess } from "./in-memory-instance-config-core-data-access";

export type TInMemoryInstanceConfigCore = ReturnType<typeof buildInMemoryInstanceConfigCore>;

// Instance Config Core over in-memory data access and key store, not initialized. Pass another build's inMemory and
// keyStore to get a second pod sharing the same database and cache.
export const buildInMemoryInstanceConfigCore = ({
  inMemory = new InMemoryInstanceConfigCoreDataAccess(),
  keyStore = new InMemoryKeyStore(),
  kms = new FakeKmsCoreDomain(),
  env = new FakeInstanceConfigEnv(),
  fipsEnabled = false
}: {
  inMemory?: InMemoryInstanceConfigCoreDataAccess;
  keyStore?: TDomainKeyStore;
  kms?: TKmsCoreDomain;
  env?: FakeInstanceConfigEnv;
  fipsEnabled?: boolean;
} = {}) => {
  const timers: Array<{ name: string; task: () => Promise<void> | void }> = [];
  const module = new InstanceConfigCoreModule({
    transactionRunner: inMemory.transactionRunner,
    dataAccess: inMemory.dataAccess,
    keyStore,
    kmsCoreDomain: kms,
    env,
    isFipsModeEnabled: () => fipsEnabled,
    startLocalRefresh: ({ name, task }) => {
      timers.push({ name, task });
      return { stop: () => undefined };
    }
  });
  return { module, config: module.service, inMemory, state: inMemory.state, keyStore, kms, env, timers };
};
