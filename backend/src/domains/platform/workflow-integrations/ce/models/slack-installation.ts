export type TSlackInstallationRecord = {
  teamId: string;
  teamName: string;
  slackUserId: string;
  slackAppId: string;
  slackBotId: string;
  slackBotUserId: string;
  // Encrypted with the org's data key.
  encryptedBotAccessToken: Buffer;
};

// What a Slack workspace install gave us. Replaced whole on reinstall.
export class SlackInstallation {
  private constructor(
    readonly teamId: string,
    readonly teamName: string,
    private readonly slackUserId: string,
    private readonly slackAppId: string,
    private readonly slackBotId: string,
    private readonly slackBotUserId: string,
    readonly encryptedBotAccessToken: Buffer
  ) {}

  static restore(record: TSlackInstallationRecord): SlackInstallation {
    return new SlackInstallation(
      record.teamId,
      record.teamName,
      record.slackUserId,
      record.slackAppId,
      record.slackBotId,
      record.slackBotUserId,
      record.encryptedBotAccessToken
    );
  }

  toJSON(): TSlackInstallationRecord {
    return {
      teamId: this.teamId,
      teamName: this.teamName,
      slackUserId: this.slackUserId,
      slackAppId: this.slackAppId,
      slackBotId: this.slackBotId,
      slackBotUserId: this.slackBotUserId,
      encryptedBotAccessToken: this.encryptedBotAccessToken
    };
  }
}
