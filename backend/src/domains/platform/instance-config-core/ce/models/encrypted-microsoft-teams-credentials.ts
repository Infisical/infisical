import { EncryptedCredentials, TDecrypt, TEncrypt } from "./encrypted-credentials";
import { MicrosoftTeamsAppCredentials } from "./microsoft-teams-app-credentials";

// Field names match the super_admin columns, so restore() takes the row as it is.
export type TEncryptedMicrosoftTeamsCredentialsRecord = {
  encryptedMicrosoftTeamsAppId?: Buffer | null;
  encryptedMicrosoftTeamsClientSecret?: Buffer | null;
  encryptedMicrosoftTeamsBotId?: Buffer | null;
};

export class EncryptedMicrosoftTeamsCredentials extends EncryptedCredentials {
  protected readonly clearable = false;

  private constructor(
    private readonly appId: Buffer | null,
    private readonly clientSecret: Buffer | null,
    private readonly botId: Buffer | null
  ) {
    super();
  }

  static restore(record: TEncryptedMicrosoftTeamsCredentialsRecord): EncryptedMicrosoftTeamsCredentials {
    return new EncryptedMicrosoftTeamsCredentials(
      record.encryptedMicrosoftTeamsAppId ?? null,
      record.encryptedMicrosoftTeamsClientSecret ?? null,
      record.encryptedMicrosoftTeamsBotId ?? null
    );
  }

  // Values left undefined stay as they are.
  change(
    input: { appId?: string; clientSecret?: string; botId?: string },
    encrypt: TEncrypt
  ): EncryptedMicrosoftTeamsCredentials {
    return new EncryptedMicrosoftTeamsCredentials(
      this.encryptIfGiven("Microsoft Teams app ID", input.appId, this.appId, encrypt),
      this.encryptIfGiven("Microsoft Teams client secret", input.clientSecret, this.clientSecret, encrypt),
      this.encryptIfGiven("Microsoft Teams bot ID", input.botId, this.botId, encrypt)
    );
  }

  decrypt(decrypt: TDecrypt): MicrosoftTeamsAppCredentials {
    return MicrosoftTeamsAppCredentials.restore({
      appId: EncryptedCredentials.decryptText(this.appId, decrypt),
      clientSecret: EncryptedCredentials.decryptText(this.clientSecret, decrypt),
      botId: EncryptedCredentials.decryptText(this.botId, decrypt)
    });
  }

  toJSON(): Required<TEncryptedMicrosoftTeamsCredentialsRecord> {
    return {
      encryptedMicrosoftTeamsAppId: this.appId,
      encryptedMicrosoftTeamsClientSecret: this.clientSecret,
      encryptedMicrosoftTeamsBotId: this.botId
    };
  }
}
