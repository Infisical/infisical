export type TGitHubAppCredentialsRecord = {
  clientId: string;
  clientSecret: string;
  appSlug: string;
  appId: string;
  privateKey: string;
};

// The GitHub app the instance admin stored for GitHub app connections, decrypted. A value that is not set is "".
export class GitHubAppCredentials {
  private constructor(
    readonly clientId: string,
    readonly clientSecret: string,
    readonly appSlug: string,
    readonly appId: string,
    readonly privateKey: string
  ) {}

  static restore(record: TGitHubAppCredentialsRecord): GitHubAppCredentials {
    return new GitHubAppCredentials(
      record.clientId,
      record.clientSecret,
      record.appSlug,
      record.appId,
      record.privateKey
    );
  }

  toJSON(): TGitHubAppCredentialsRecord {
    return {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      appSlug: this.appSlug,
      appId: this.appId,
      privateKey: this.privateKey
    };
  }
}
