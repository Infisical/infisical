import { InMemoryRootKeyConfigStore } from "../testing/in-memory-root-key-config-store";
import { describeRootKeyConfigStoreContract } from "../testing/root-key-config-store-contract";

describeRootKeyConfigStoreContract("InMemoryRootKeyConfigStore", async () => ({
  store: new InMemoryRootKeyConfigStore()
}));
