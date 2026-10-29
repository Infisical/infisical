import { crypto } from "@app/lib/crypto/cryptography";

import { InMemoryKmsCoreUnitOfWork } from "../testing/in-memory-kms-core-unit-of-work";
import { InMemoryKmsKeyRepository } from "../testing/in-memory-kms-key-repository";
import { KmsCryptoService } from "./kms-crypto-service";
import { KmsKeyService } from "./kms-key-service";

const setup = () => {
  const kmsKeyRepository = new InMemoryKmsKeyRepository();
  const kmsCryptoService = new KmsCryptoService({
    kmsKeyRepository,
    unitOfWork: new InMemoryKmsCoreUnitOfWork({ kmsKeys: kmsKeyRepository }),
    rootKey: crypto.randomBytes(32)
  });
  const kmsKeyService = new KmsKeyService({ kmsKeyRepository });
  return { kmsKeyRepository, kmsCryptoService, kmsKeyService };
};

describe("KMS Core services (class)", () => {
  test("encrypts and decrypts with the org key", async () => {
    const { kmsCryptoService } = setup();

    const ciphertext = await kmsCryptoService.encryptWithOrgKey({ orgId: "org-1", plaintext: Buffer.from("hello") });
    const plaintext = await kmsCryptoService.decryptWithOrgKey({ orgId: "org-1", ciphertext });

    expect(plaintext.toString()).toBe("hello");
  });

  test("creates one key per org and reuses it", async () => {
    const { kmsKeyRepository, kmsCryptoService } = setup();

    await kmsCryptoService.encryptWithOrgKey({ orgId: "org-1", plaintext: Buffer.from("a") });
    await kmsCryptoService.encryptWithOrgKey({ orgId: "org-1", plaintext: Buffer.from("b") });
    await kmsCryptoService.encryptWithOrgKey({ orgId: "org-2", plaintext: Buffer.from("c") });

    expect(kmsKeyRepository.rows.size).toBe(2);
    expect(kmsKeyRepository.lockedOrgIds).toEqual(["org-1", "org-2"]);
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
