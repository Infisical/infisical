import { poolStoreConnection } from "@app/domains/lib/data-access";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { TKmsKeyStoreFixture } from "../testing/kms-key-store-contract";
import { describeKmsKeyVersionStoreContract } from "../testing/kms-key-version-store-contract";
import { KmsKeyStore } from "./kms-key-store";
import { KmsKeyVersionStore } from "./kms-key-version-store";

describe("KmsKeyVersionStore on Postgres", () => {
  const h = setupIntegration();

  const postgresFixture = async (): Promise<TKmsKeyStoreFixture> => ({
    keyStore: new KmsKeyStore(poolStoreConnection(h.db)),
    versionStore: new KmsKeyVersionStore(poolStoreConnection(h.db)),
    newOrg: async () => (await h.factories.organization()).id,
    newProject: async (orgId) => (await h.factories.project({ orgId })).project.id
  });

  describeKmsKeyVersionStoreContract("postgres", postgresFixture);
});
