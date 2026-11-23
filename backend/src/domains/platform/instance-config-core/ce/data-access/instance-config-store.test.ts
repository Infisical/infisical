import { randomUUID } from "node:crypto";

import { InMemoryInstanceConfigStore } from "../testing/in-memory-instance-config-store";
import { describeInstanceConfigStoreContract } from "../testing/instance-config-store-contract";

describeInstanceConfigStoreContract("InMemoryInstanceConfigStore", async () => {
  const store = new InMemoryInstanceConfigStore();
  return {
    store,
    addSamlOrg: async () => {
      const org = { id: randomUUID(), slug: `org-${randomUUID()}` };
      store.addOrg({ ...org, authEnforced: false, authMethod: "saml" });
      return org;
    }
  };
});
