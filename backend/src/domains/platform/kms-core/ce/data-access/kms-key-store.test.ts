import { randomUUID } from "node:crypto";

import { InMemoryKmsKeyStore } from "../testing/in-memory-kms-key-store";
import { InMemoryKmsKeyVersionStore } from "../testing/in-memory-kms-key-version-store";
import { InMemoryPlatformRows } from "../testing/in-memory-platform-rows";
import { describeKmsKeyStoreContract, TKmsKeyStoreFixture } from "../testing/kms-key-store-contract";

const inMemoryFixture = async (): Promise<TKmsKeyStoreFixture> => {
  const platformRows = new InMemoryPlatformRows();
  const versionStore = new InMemoryKmsKeyVersionStore();
  return {
    keyStore: new InMemoryKmsKeyStore(platformRows, versionStore),
    versionStore,
    newOrg: async () => {
      const id = randomUUID();
      platformRows.addOrg(id);
      return id;
    },
    newProject: async (orgId, { type, pendingDeletion } = {}) => {
      const id = randomUUID();
      platformRows.addProject(id, orgId, { type, deleteAfter: pendingDeletion ? new Date() : null });
      return id;
    }
  };
};

describeKmsKeyStoreContract("in memory", inMemoryFixture);
