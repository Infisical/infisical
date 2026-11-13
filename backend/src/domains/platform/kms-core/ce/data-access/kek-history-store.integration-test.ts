import { TableName } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { describeKekHistoryStoreContract } from "../testing/kek-history-store-contract";
import { KekHistoryStore } from "./kek-history-store";

const h = setupIntegration({ freshDatabase: true });

describeKekHistoryStoreContract("KekHistoryStore", async () => {
  await h.db(TableName.KmsKekHistory).delete();
  return { store: new KekHistoryStore(() => h.db) };
});
