import { KmsDataKey } from "../module";
import { FakeKmsCore } from "./fake-kms-core";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe("FakeKmsCore", () => {
  test("should round-trip a project data-key cipher for a project it has never seen", async () => {
    // Setup
    const kms = new FakeKmsCore();

    // Action
    const { encryptor, decryptor } = await kms.dataKeyService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: "project-1"
    });

    // Assert
    expect(decryptor(encryptor({ plainText: Buffer.from("value") })).toString()).toBe("value");
  });

  test("should decrypt with the root key what it encrypted", () => {
    // Setup
    const kms = new FakeKmsCore();

    // Action
    const cipherText = kms.rootKeyService.encryptWithRootKey()(Buffer.from("secret"));

    // Assert
    expect(kms.rootKeyService.decryptWithRootKey()(cipherText).toString()).toBe("secret");
  });

  test("should give a different org a different data key", async () => {
    // Setup
    const kms = new FakeKmsCore();
    const a = await kms.dataKeyService.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: "org-a" });
    const b = await kms.dataKeyService.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: "org-b" });

    // Action
    const blob = a.encryptor({ plainText: Buffer.from("x") }).cipherTextBlob;

    // Assert
    expect(() => b.decryptor({ cipherTextBlob: blob })).toThrow();
  });
});
