import { KmsDataKey } from "../module";
import { FakeKmsCoreDomain } from "./fake-kms-core-domain";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe("FakeKmsCoreDomain", () => {
  test("should round-trip a project data-key cipher for a project it has never seen", async () => {
    // Setup
    const kms = new FakeKmsCoreDomain();

    // Action
    const { encryptor, decryptor } = await kms.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: "project-1"
    });

    // Assert
    expect(decryptor(encryptor({ plainText: Buffer.from("value") })).toString()).toBe("value");
  });

  test("should decrypt with the root key what it encrypted", () => {
    // Setup
    const kms = new FakeKmsCoreDomain();

    // Action
    const cipherText = kms.encryptWithRootKey()(Buffer.from("secret"));

    // Assert
    expect(kms.decryptWithRootKey()(cipherText).toString()).toBe("secret");
  });

  test("should give a different org a different data key", async () => {
    // Setup
    const kms = new FakeKmsCoreDomain();
    const a = await kms.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: "org-a" });
    const b = await kms.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: "org-b" });

    // Action
    const blob = a.encryptor({ plainText: Buffer.from("x") }).cipherTextBlob;

    // Assert
    expect(() => b.decryptor({ cipherTextBlob: blob })).toThrow();
  });
});
