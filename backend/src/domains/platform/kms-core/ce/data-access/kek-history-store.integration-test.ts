import { TableName } from "@app/db/schemas";
import { poolStoreConnection } from "@app/domains/lib/data-access";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { describeKekHistoryStoreContract } from "../testing/kek-history-store-contract";
import { KekHistoryStore } from "./kek-history-store";

const h = setupIntegration({ freshDatabase: true });

describeKekHistoryStoreContract("KekHistoryStore", async () => {
  await h.db(TableName.KmsKekHistory).delete();
  return { store: new KekHistoryStore(poolStoreConnection(h.db)) };
});
