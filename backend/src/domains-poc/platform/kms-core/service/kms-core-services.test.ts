import { InMemoryTransactionRunner } from "@app/domains-poc/lib/testing/in-memory-transaction-runner";
import { crypto } from "@app/lib/crypto/cryptography";

import { InMemoryKmsKeyDataAccess } from "../testing/in-memory-kms-key-data-access";
import { KmsCryptoService } from "./kms-crypto-service";
import { KmsKeyService } from "./kms-key-service";

const setup = () => {
  const kmsKeyDataAccess = new InMemoryKmsKeyDataAccess();
  const kmsCryptoService = new KmsCryptoService({
    kmsKeyDataAccess,
    transactionRunner: new InMemoryTransactionRunner({ kmsKeys: kmsKeyDataAccess }),
    rootKey: crypto.randomBytes(32),
    hooks: {}
  });
  const kmsKeyService = new KmsKeyService({ kmsKeyDataAccess });
  return { kmsKeyDataAccess, kmsCryptoService, kmsKeyService };
};

describe("KMS Core services", () => {
  test("encrypts and decrypts with the org key", async () => {
    const { kmsCryptoService } = setup();

    const ciphertext = await kmsCryptoService.encryptWithOrgKey({ orgId: "org-1", plaintext: Buffer.from("hello") });
    const plaintext = await kmsCryptoService.decryptWithOrgKey({ orgId: "org-1", ciphertext });

    expect(plaintext.toString()).toBe("hello");
  });

  test("creates one key per org and reuses it", async () => {
    const { kmsKeyDataAccess, kmsCryptoService } = setup();

    await kmsCryptoService.encryptWithOrgKey({ orgId: "org-1", plaintext: Buffer.from("a") });
    await kmsCryptoService.encryptWithOrgKey({ orgId: "org-1", plaintext: Buffer.from("b") });
    await kmsCryptoService.encryptWithOrgKey({ orgId: "org-2", plaintext: Buffer.from("c") });

    expect(kmsKeyDataAccess.rows.size).toBe(2);
    expect(kmsKeyDataAccess.lockedOrgIds).toEqual(["org-1", "org-2"]);
  });

  test("refuses to decrypt for an org without a key", async () => {
    const { kmsCryptoService } = setup();

    await expect(kmsCryptoService.decryptWithOrgKey({ orgId: "org-1", ciphertext: Buffer.from("x") })).rejects.toThrow(
      /No KMS key found/
    );
  });

  test("returns the org key", async () => {
    const { kmsCryptoService, kmsKeyService } = setup();
    await kmsCryptoService.encryptWithOrgKey({ orgId: "org-1", plaintext: Buffer.from("a") });

    const kmsKey = await kmsKeyService.getOrgKey("org-1");

    expect(kmsKey.orgId).toBe("org-1");
    expect(kmsKey.name).toBe("poc-org-default");
    expect(kmsKey.isDisabled).toBe(false);
  });
});
