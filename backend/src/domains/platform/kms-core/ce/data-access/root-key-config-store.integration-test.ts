import { TableName } from "@app/db/schemas";
import { poolStoreConnection } from "@app/domains/lib/data-access";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { describeRootKeyConfigStoreContract } from "../testing/root-key-config-store-contract";
import { RootKeyConfigStore } from "./root-key-config-store";

// The template database already holds the active root config row, and the table is instance-wide.
const h = setupIntegration({ freshDatabase: true });

describeRootKeyConfigStoreContract("RootKeyConfigStore", async () => {
  await h.db(TableName.KmsServerRootConfig).delete();
  return { store: new RootKeyConfigStore(poolStoreConnection(h.db)) };
});
