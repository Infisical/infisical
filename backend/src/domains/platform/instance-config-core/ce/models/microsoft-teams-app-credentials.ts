export type TMicrosoftTeamsAppCredentialsRecord = { appId: string; clientSecret: string; botId: string };

// The instance's Microsoft Teams bot, decrypted. A value that is not set is "".
export class MicrosoftTeamsAppCredentials {
  private constructor(
    readonly appId: string,
    readonly clientSecret: string,
    readonly botId: string
  ) {}

  static restore(record: TMicrosoftTeamsAppCredentialsRecord): MicrosoftTeamsAppCredentials {
    return new MicrosoftTeamsAppCredentials(record.appId, record.clientSecret, record.botId);
  }

  // The bot can only be built with all three.
  isComplete(): boolean {
    return Boolean(this.appId && this.clientSecret && this.botId);
  }

  toJSON(): TMicrosoftTeamsAppCredentialsRecord {
    return { appId: this.appId, clientSecret: this.clientSecret, botId: this.botId };
  }
}
