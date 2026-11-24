import { EncryptedCredentials, TDecrypt, TEncrypt } from "./encrypted-credentials";
import { GitHubAppCredentials } from "./github-app-credentials";

// Field names match the super_admin columns, so restore() takes the row as it is.
export type TEncryptedGitHubAppCredentialsRecord = {
  encryptedGitHubAppConnectionClientId?: Buffer | null;
  encryptedGitHubAppConnectionClientSecret?: Buffer | null;
  encryptedGitHubAppConnectionSlug?: Buffer | null;
  encryptedGitHubAppConnectionId?: Buffer | null;
  encryptedGitHubAppConnectionPrivateKey?: Buffer | null;
};

export class EncryptedGitHubAppCredentials extends EncryptedCredentials {
  protected readonly clearable = true;

  private constructor(
    private readonly clientId: Buffer | null,
    private readonly clientSecret: Buffer | null,
    private readonly appSlug: Buffer | null,
    private readonly appId: Buffer | null,
    private readonly privateKey: Buffer | null
  ) {
    super();
  }

  static restore(record: TEncryptedGitHubAppCredentialsRecord): EncryptedGitHubAppCredentials {
    return new EncryptedGitHubAppCredentials(
      record.encryptedGitHubAppConnectionClientId ?? null,
      record.encryptedGitHubAppConnectionClientSecret ?? null,
      record.encryptedGitHubAppConnectionSlug ?? null,
      record.encryptedGitHubAppConnectionId ?? null,
      record.encryptedGitHubAppConnectionPrivateKey ?? null
    );
  }

  // Values left undefined stay as they are; "" clears one.
  change(
    input: { clientId?: string; clientSecret?: string; appSlug?: string; appId?: string; privateKey?: string },
    encrypt: TEncrypt
  ): EncryptedGitHubAppCredentials {
    return new EncryptedGitHubAppCredentials(
      this.encryptIfGiven("GitHub app client ID", input.clientId, this.clientId, encrypt),
      this.encryptIfGiven("GitHub app client secret", input.clientSecret, this.clientSecret, encrypt),
      this.encryptIfGiven("GitHub app slug", input.appSlug, this.appSlug, encrypt),
      this.encryptIfGiven("GitHub app ID", input.appId, this.appId, encrypt),
      this.encryptIfGiven("GitHub app private key", input.privateKey, this.privateKey, encrypt)
    );
  }

  decrypt(decrypt: TDecrypt): GitHubAppCredentials {
    return GitHubAppCredentials.restore({
      clientId: EncryptedCredentials.decryptText(this.clientId, decrypt),
      clientSecret: EncryptedCredentials.decryptText(this.clientSecret, decrypt),
      appSlug: EncryptedCredentials.decryptText(this.appSlug, decrypt),
      appId: EncryptedCredentials.decryptText(this.appId, decrypt),
      privateKey: EncryptedCredentials.decryptText(this.privateKey, decrypt)
    });
  }

  toJSON(): Required<TEncryptedGitHubAppCredentialsRecord> {
    return {
      encryptedGitHubAppConnectionClientId: this.clientId,
      encryptedGitHubAppConnectionClientSecret: this.clientSecret,
      encryptedGitHubAppConnectionSlug: this.appSlug,
      encryptedGitHubAppConnectionId: this.appId,
      encryptedGitHubAppConnectionPrivateKey: this.privateKey
    };
  }
}
