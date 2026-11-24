import { RuleViolationError } from "@app/domains/lib/errors";

import { EncryptedMicrosoftTeamsCredentials } from "./encrypted-microsoft-teams-credentials";

const encrypt = (plainText: Buffer) => Buffer.from(`encrypted:${plainText.toString()}`);
const decrypt = (cipherText: Buffer) => Buffer.from(cipherText.toString().replace(/^encrypted:/, ""));

describe("EncryptedMicrosoftTeamsCredentials.change", () => {
  test("should encrypt the given values into their own columns and keep the rest", () => {
    // Setup
    const credentials = EncryptedMicrosoftTeamsCredentials.restore({}).change({ appId: "app", botId: "bot" }, encrypt);

    // Action
    const changed = credentials.change({ clientSecret: "secret" }, encrypt);

    // Assert
    expect(changed.toJSON()).toEqual({
      encryptedMicrosoftTeamsAppId: Buffer.from("encrypted:app"),
      encryptedMicrosoftTeamsClientSecret: Buffer.from("encrypted:secret"),
      encryptedMicrosoftTeamsBotId: Buffer.from("encrypted:bot")
    });
    expect(changed.decrypt(decrypt).toJSON()).toEqual({ appId: "app", clientSecret: "secret", botId: "bot" });
  });

  test("should refuse to clear a value", () => {
    // Setup
    const credentials = EncryptedMicrosoftTeamsCredentials.restore({}).change({ botId: "bot" }, encrypt);

    // Action
    const act = () => credentials.change({ botId: "" }, encrypt);

    // Assert
    expect(act).toThrow(RuleViolationError);
    expect(act).toThrow("Microsoft Teams bot ID cannot be empty");
  });
});
