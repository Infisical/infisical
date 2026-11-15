import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { FakeKmsCore } from "@app/domains/platform/kms-core/ce/testing/fake-kms-core";

import { InstanceConfigCoreModule } from "../module";
import { FakeInstanceConfigEnv } from "./fake-instance-config-env";
import { InMemoryInstanceConfigStores } from "./in-memory-instance-config-stores";

type TBuildOptions = {
  memory?: InMemoryInstanceConfigStores;
  keyStore?: InMemoryKeyStore;
  kmsCore?: FakeKmsCore;
  env?: FakeInstanceConfigEnv;
  isFipsEnabled?: () => boolean;
};

// Instance Config Core over in-memory stores. Passing another build's `memory`, `keyStore` and `kmsCore` (the root key) gives a second pod on the
// same database and Redis.
export const buildInstanceConfigCore = async ({
  memory = new InMemoryInstanceConfigStores(),
  keyStore = new InMemoryKeyStore(),
  kmsCore = new FakeKmsCore(),
  env = new FakeInstanceConfigEnv(),
  isFipsEnabled = () => false
}: TBuildOptions = {}) => {
  const module = await InstanceConfigCoreModule.create({
    transactionRunner: memory.transactionRunner,
    instanceConfigStore: memory.instanceConfigStore,
    keyStore,
    kmsRootKeyService: kmsCore.kmsRootKeyService,
    instanceConfigEnv: env,
    isFipsEnabled
  });
  return { module, memory, keyStore, kmsCore };
};
