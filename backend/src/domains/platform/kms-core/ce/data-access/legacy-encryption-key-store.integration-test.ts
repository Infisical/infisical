import { TableName } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { describeLegacyEncryptionKeyStoreContract } from "../testing/legacy-encryption-key-store-contract";
import { LegacyEncryptionKeyStore } from "./legacy-encryption-key-store";

const h = setupIntegration({ freshDatabase: true });

describeLegacyEncryptionKeyStoreContract("LegacyEncryptionKeyStore", async () => {
  await h.db(TableName.KmsLegacyEncryptionKey).delete();
  return { store: new LegacyEncryptionKeyStore(() => h.db) };
});
