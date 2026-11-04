import { InMemoryTransactionRunner } from "@app/domains-poc/lib/testing/in-memory-transaction-runner";
import { FakeBillingCoreService } from "@app/domains-poc/platform/billing-core/testing/fake-billing-core-service";
import { crypto } from "@app/lib/crypto/cryptography";

import { KmsCryptoService } from "../../service/kms-crypto-service";
import { InMemoryKmsKeyDataAccess } from "../../testing/in-memory-kms-key-data-access";
import { InMemoryExternalKmsDataAccess } from "../testing/in-memory-external-kms-data-access";
import { PocExternalKeyProvider } from "./external-key-provider";
import { ExternalKmsService } from "./external-kms-service";

const setup = () => {
  const dataAccess = { kmsKeys: new InMemoryKmsKeyDataAccess(), externalKms: new InMemoryExternalKmsDataAccess() };
  const rootKey = crypto.randomBytes(32);
  const billingCore = new FakeBillingCoreService(["externalKms"]);

  const externalKmsService = new ExternalKmsService({
    dataAccess,
    transactionRunner: new InMemoryTransactionRunner(dataAccess),
    externalKeyProvider: new PocExternalKeyProvider(crypto.randomBytes(32)),
    rootKey,
    billingCore
  });
  const kmsCryptoService = new KmsCryptoService({
    kmsKeyDataAccess: dataAccess.kmsKeys,
    transactionRunner: new InMemoryTransactionRunner(dataAccess),
    rootKey,
    hooks: { unwrapOrgKey: (kmsKey) => externalKmsService.unwrapOrgKey(kmsKey) }
  });

  return { dataAccess, billingCore, kmsCryptoService, externalKmsService };
};

describe("External KMS (EE)", () => {
  test("data encrypted before the switch still decrypts after it", async () => {
    const { dataAccess, kmsCryptoService, externalKmsService } = setup();
    const ciphertext = await kmsCryptoService.encryptWithOrgKey({ orgId: "org-1", plaintext: Buffer.from("hello") });

    const externalKms = await externalKmsService.assignToOrgKey("org-1");

    const plaintext = await kmsCryptoService.decryptWithOrgKey({ orgId: "org-1", ciphertext });
    expect(plaintext.toString()).toBe("hello");
    expect(externalKms.provider).toBe("poc");
    expect(dataAccess.externalKms.rows.size).toBe(1);
  });

  test("refuses to assign twice", async () => {
    const { kmsCryptoService, externalKmsService } = setup();
    await kmsCryptoService.encryptWithOrgKey({ orgId: "org-1", plaintext: Buffer.from("a") });
    await externalKmsService.assignToOrgKey("org-1");

    await expect(externalKmsService.assignToOrgKey("org-1")).rejects.toThrow(/already uses an external KMS/);
  });

  test("refuses to assign without the plan feature", async () => {
    const { billingCore, kmsCryptoService, externalKmsService } = setup();
    await kmsCryptoService.encryptWithOrgKey({ orgId: "org-1", plaintext: Buffer.from("a") });
    billingCore.licensedFeatures.length = 0;

    await expect(externalKmsService.assignToOrgKey("org-1")).rejects.toThrow(/Plan does not include/);
  });

  test("stops decrypting when the plan feature is removed", async () => {
    const { billingCore, kmsCryptoService, externalKmsService } = setup();
    const ciphertext = await kmsCryptoService.encryptWithOrgKey({ orgId: "org-1", plaintext: Buffer.from("a") });
    await externalKmsService.assignToOrgKey("org-1");
    billingCore.licensedFeatures.length = 0;

    await expect(kmsCryptoService.decryptWithOrgKey({ orgId: "org-1", ciphertext })).rejects.toThrow(
      /Plan does not include/
    );
  });
});
