import { EncryptedGitHubAppCredentials } from "./encrypted-github-app-credentials";

const encrypt = (plainText: Buffer) => Buffer.from(`encrypted:${plainText.toString()}`);
const decrypt = (cipherText: Buffer) => Buffer.from(cipherText.toString().replace(/^encrypted:/, ""));

const stored = () =>
  EncryptedGitHubAppCredentials.restore({}).change(
    { clientId: "id", clientSecret: "secret", appSlug: "slug", appId: "123", privateKey: "key" },
    encrypt
  );

describe("EncryptedGitHubAppCredentials.change", () => {
  test("should encrypt each value into its own column", () => {
    // Action
    const credentials = stored();

    // Assert
    expect(credentials.toJSON()).toEqual({
      encryptedGitHubAppConnectionClientId: Buffer.from("encrypted:id"),
      encryptedGitHubAppConnectionClientSecret: Buffer.from("encrypted:secret"),
      encryptedGitHubAppConnectionSlug: Buffer.from("encrypted:slug"),
      encryptedGitHubAppConnectionId: Buffer.from("encrypted:123"),
      encryptedGitHubAppConnectionPrivateKey: Buffer.from("encrypted:key")
    });
  });

  test("should clear a value given an empty string and keep the values left undefined", () => {
    // Setup
    const credentials = stored();

    // Action
    const changed = credentials.change({ privateKey: "" }, encrypt);

    // Assert
    expect(changed.decrypt(decrypt).toJSON()).toEqual({
      clientId: "id",
      clientSecret: "secret",
      appSlug: "slug",
      appId: "123",
      privateKey: ""
    });
  });
});
