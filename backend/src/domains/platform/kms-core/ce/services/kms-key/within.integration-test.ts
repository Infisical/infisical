import { setupIntegration } from "@app/domains/lib/testing/integration";
import { sealKnexTransaction } from "@app/domains/lib/transactions";

import { buildKmsCoreStoreAccess } from "../../data-access/kms-core-stores";
import { RootKey } from "../../models/root-key";
import { TKmsDataKeyService } from "../data-key/service";
import { KmsKeyService } from "./service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe("KmsKeyService.within on Postgres", () => {
  const h = setupIntegration();

  const newService = () => {
    const { transactionRunner, stores } = buildKmsCoreStoreAccess(h.db, () => h.db);
    return new KmsKeyService(
      transactionRunner,
      stores,
      RootKey.generate(),
      undefined,
      {} as unknown as TKmsDataKeyService
    );
  };

  test("should decrypt a pre-rotation ciphertext with a decryptor used after the caller's transaction ended", async () => {
    // Setup
    const tn = await h.newTenant();
    const kms = newService();
    const key = await kms.generateKmsKey({
      orgId: tn.org.id,
      projectId: tn.project.id,
      isReserved: false,
      name: "rotating"
    });
    const encrypt = await kms.encryptWithKmsKey({ kmsId: key.id });
    const before = await encrypt({ plainText: Buffer.from("pre-rotation") });
    await kms.rotateKmsKey(key.id);

    // Action
    const decrypt = await h.db.transaction((trx) =>
      kms.within(sealKnexTransaction(trx)).decryptWithKmsKey({ kmsId: key.id })
    );
    const plainText = await decrypt(before);

    // Assert
    expect(plainText.toString()).toBe("pre-rotation");
  });
});
