import { randomUUID } from "node:crypto";

import { InMemoryOrganizationKeyStore } from "../testing/in-memory-organization-key-store";
import { InMemoryPlatformRows } from "../testing/in-memory-platform-rows";
import { describeOrganizationKeyStoreContract } from "../testing/organization-key-store-contract";

describeOrganizationKeyStoreContract("in-memory", async () => {
  const rows = new InMemoryPlatformRows();
  return {
    store: new InMemoryOrganizationKeyStore(rows),
    newOrg: async () => {
      const id = randomUUID();
      rows.addOrg(id);
      return id;
    },
    newKmsKeyId: async () => randomUUID()
  };
});
