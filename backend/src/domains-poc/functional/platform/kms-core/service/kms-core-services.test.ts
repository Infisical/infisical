import { crypto } from "@app/lib/crypto/cryptography";

import {
  createInMemoryKmsCoreUnitOfWork,
  createInMemoryKmsKeyRepository
} from "../testing/in-memory-kms-key-repository";
import { createKmsCryptoService } from "./kms-crypto-service";
import { createKmsKeyService } from "./kms-key-service";

const setup = () => {
  const { rows, repository } = createInMemoryKmsKeyRepository();
  const kmsCryptoService = createKmsCryptoService({
    kmsKeyRepository: repository,
    unitOfWork: createInMemoryKmsCoreUnitOfWork({ kmsKeys: repository }),
    rootKey: crypto.randomBytes(32)
  });
  const kmsKeyService = createKmsKeyService({ kmsKeyRepository: repository });
  return { rows, kmsCryptoService, kmsKeyService };
};

describe("KMS Core services (functional)", () => {
  test("encrypts and decrypts with the org key", async () => {
    const { kmsCryptoService } = setup();

    const ciphertext = await kmsCryptoService.encryptWithOrgKey({ orgId: "org-1", plaintext: Buffer.from("hello") });
    const plaintext = await kmsCryptoService.decryptWithOrgKey({ orgId: "org-1", ciphertext });

    expect(plaintext.toString()).toBe("hello");
  });

  test("creates one key per org and reuses it", async () => {
    const { rows, kmsCryptoService } = setup();

    await kmsCryptoService.encryptWithOrgKey({ orgId: "org-1", plaintext: Buffer.from("a") });
    await kmsCryptoService.encryptWithOrgKey({ orgId: "org-1", plaintext: Buffer.from("b") });
    await kmsCryptoService.encryptWithOrgKey({ orgId: "org-2", plaintext: Buffer.from("c") });

    expect(rows.size).toBe(2);
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
