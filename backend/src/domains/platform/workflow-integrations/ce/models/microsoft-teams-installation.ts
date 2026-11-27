export enum MicrosoftTeamsTokenKind {
  // Microsoft Graph, issued by the customer's tenant: app catalog, teams and channels.
  Graph = "graph",
  // Bot Framework, issued by the botframework.com tenant: posting to channels.
  BotFramework = "bot-framework"
}

// A token this close to expiry is fetched again rather than reused.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export type TMicrosoftTeamsInstallationRecord = {
  tenantId: string;
  // The app's id in the tenant's catalog, known once the bot is installed there.
  internalTeamsAppId: string | null;
  // Both tokens are encrypted with the org's data key.
  encryptedAccessToken: Buffer | null;
  accessTokenExpiresAt: Date | null;
  encryptedBotAccessToken: Buffer | null;
  botAccessTokenExpiresAt: Date | null;
};

// A tenant's Teams install. Immutable: each change returns a new instance.
export class MicrosoftTeamsInstallation {
  private constructor(
    readonly tenantId: string,
    readonly internalTeamsAppId: string | null,
    private readonly encryptedAccessToken: Buffer | null,
    private readonly accessTokenExpiresAt: Date | null,
    private readonly encryptedBotAccessToken: Buffer | null,
    private readonly botAccessTokenExpiresAt: Date | null
  ) {}

  static forTenant(tenantId: string): MicrosoftTeamsInstallation {
    return new MicrosoftTeamsInstallation(tenantId, null, null, null, null, null);
  }

  static restore(record: TMicrosoftTeamsInstallationRecord): MicrosoftTeamsInstallation {
    return new MicrosoftTeamsInstallation(
      record.tenantId,
      record.internalTeamsAppId,
      record.encryptedAccessToken,
      record.accessTokenExpiresAt,
      record.encryptedBotAccessToken,
      record.botAccessTokenExpiresAt
    );
  }

  // The stored token of this kind if it is still good for at least TOKEN_REFRESH_MARGIN_MS, else null.
  cachedToken(kind: MicrosoftTeamsTokenKind, now: Date): Buffer | null {
    const [token, expiresAt] =
      kind === MicrosoftTeamsTokenKind.Graph
        ? [this.encryptedAccessToken, this.accessTokenExpiresAt]
        : [this.encryptedBotAccessToken, this.botAccessTokenExpiresAt];
    if (!token || !expiresAt) return null;
    return expiresAt.getTime() > now.getTime() + TOKEN_REFRESH_MARGIN_MS ? token : null;
  }

  withToken(kind: MicrosoftTeamsTokenKind, encryptedToken: Buffer, expiresAt: Date): MicrosoftTeamsInstallation {
    const record = this.toJSON();
    return MicrosoftTeamsInstallation.restore(
      kind === MicrosoftTeamsTokenKind.Graph
        ? { ...record, encryptedAccessToken: encryptedToken, accessTokenExpiresAt: expiresAt }
        : { ...record, encryptedBotAccessToken: encryptedToken, botAccessTokenExpiresAt: expiresAt }
    );
  }

  withInternalAppId(internalTeamsAppId: string): MicrosoftTeamsInstallation {
    return MicrosoftTeamsInstallation.restore({ ...this.toJSON(), internalTeamsAppId });
  }

  toJSON(): TMicrosoftTeamsInstallationRecord {
    return {
      tenantId: this.tenantId,
      internalTeamsAppId: this.internalTeamsAppId,
      encryptedAccessToken: this.encryptedAccessToken,
      accessTokenExpiresAt: this.accessTokenExpiresAt,
      encryptedBotAccessToken: this.encryptedBotAccessToken,
      botAccessTokenExpiresAt: this.botAccessTokenExpiresAt
    };
  }
}
