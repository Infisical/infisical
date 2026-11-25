export type TSlackAppCredentialsRecord = { clientId: string; clientSecret: string };

// The instance's Slack app, decrypted. A value that is not set is "".
export class SlackAppCredentials {
  private constructor(
    readonly clientId: string,
    readonly clientSecret: string
  ) {}

  static restore(record: TSlackAppCredentialsRecord): SlackAppCredentials {
    return new SlackAppCredentials(record.clientId, record.clientSecret);
  }

  // Each value the instance has not stored falls back to the env's (WORKFLOW_SLACK_CLIENT_ID and _SECRET).
  orEnv(defaults: { clientId?: string; clientSecret?: string }): SlackAppCredentials {
    return new SlackAppCredentials(
      this.clientId || defaults.clientId || "",
      this.clientSecret || defaults.clientSecret || ""
    );
  }

  toJSON(): TSlackAppCredentialsRecord {
    return { clientId: this.clientId, clientSecret: this.clientSecret };
  }
}
