import { RuleViolationError } from "@app/domains/lib/errors";

import { EncryptedSlackCredentials } from "./encrypted-slack-credentials";

const encrypt = (plainText: Buffer) => Buffer.from(`encrypted:${plainText.toString()}`);
const decrypt = (cipherText: Buffer) => Buffer.from(cipherText.toString().replace(/^encrypted:/, ""));

describe("EncryptedSlackCredentials.change", () => {
  test("should encrypt the given values and keep the rest", () => {
    // Setup
    const credentials = EncryptedSlackCredentials.restore({}).change(
      { clientId: "id", clientSecret: "secret" },
      encrypt
    );

    // Action
    const changed = credentials.change({ clientSecret: "new-secret" }, encrypt);

    // Assert
    expect(changed.toJSON()).toEqual({
      encryptedSlackClientId: Buffer.from("encrypted:id"),
      encryptedSlackClientSecret: Buffer.from("encrypted:new-secret")
    });
  });

  test("should refuse to clear a value and leave the credentials unchanged", () => {
    // Setup
    const credentials = EncryptedSlackCredentials.restore({}).change(
      { clientId: "id", clientSecret: "secret" },
      encrypt
    );

    // Action
    const act = () => credentials.change({ clientId: "other", clientSecret: "" }, encrypt);

    // Assert
    expect(act).toThrow(RuleViolationError);
    expect(act).toThrow("Slack client secret cannot be empty");
    expect(credentials.decrypt(decrypt).toJSON()).toEqual({ clientId: "id", clientSecret: "secret" });
  });
});

describe("EncryptedSlackCredentials.decrypt", () => {
  test("should read a value that is not set as an empty string", () => {
    // Setup
    const credentials = EncryptedSlackCredentials.restore({ encryptedSlackClientId: Buffer.from("encrypted:id") });

    // Action
    const decrypted = credentials.decrypt(decrypt);

    // Assert
    expect(decrypted.toJSON()).toEqual({ clientId: "id", clientSecret: "" });
  });
});
