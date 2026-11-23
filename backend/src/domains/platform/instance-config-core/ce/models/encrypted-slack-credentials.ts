import { EncryptedCredentials, TDecrypt, TEncrypt } from "./encrypted-credentials";
import { SlackAppCredentials } from "./slack-app-credentials";

// Field names match the super_admin columns, so restore() takes the row as it is.
export type TEncryptedSlackCredentialsRecord = {
  encryptedSlackClientId?: Buffer | null;
  encryptedSlackClientSecret?: Buffer | null;
};

export class EncryptedSlackCredentials extends EncryptedCredentials {
  protected readonly clearable = false;

  private constructor(
    private readonly clientId: Buffer | null,
    private readonly clientSecret: Buffer | null
  ) {
    super();
  }

  static restore(record: TEncryptedSlackCredentialsRecord): EncryptedSlackCredentials {
    return new EncryptedSlackCredentials(
      record.encryptedSlackClientId ?? null,
      record.encryptedSlackClientSecret ?? null
    );
  }

  // Values left undefined stay as they are.
  change(input: { clientId?: string; clientSecret?: string }, encrypt: TEncrypt): EncryptedSlackCredentials {
    return new EncryptedSlackCredentials(
      this.encryptIfGiven("Slack client ID", input.clientId, this.clientId, encrypt),
      this.encryptIfGiven("Slack client secret", input.clientSecret, this.clientSecret, encrypt)
    );
  }

  decrypt(decrypt: TDecrypt): SlackAppCredentials {
    return SlackAppCredentials.restore({
      clientId: EncryptedCredentials.decryptText(this.clientId, decrypt),
      clientSecret: EncryptedCredentials.decryptText(this.clientSecret, decrypt)
    });
  }

  toJSON(): Required<TEncryptedSlackCredentialsRecord> {
    return { encryptedSlackClientId: this.clientId, encryptedSlackClientSecret: this.clientSecret };
  }
}
