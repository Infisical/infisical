import { InMemoryLegacyEncryptionKeyStore } from "../testing/in-memory-legacy-encryption-key-store";
import { describeLegacyEncryptionKeyStoreContract } from "../testing/legacy-encryption-key-store-contract";

describeLegacyEncryptionKeyStoreContract("InMemoryLegacyEncryptionKeyStore", async () => ({
  store: new InMemoryLegacyEncryptionKeyStore()
}));
