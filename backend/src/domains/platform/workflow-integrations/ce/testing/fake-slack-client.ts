/* eslint-disable class-methods-use-this */
import type { IncomingMessage, ServerResponse } from "node:http";

import { TSlackMessage } from "../models/chat-message";
import {
  TChatPostLimits,
  TChatPostRefusal,
  TSlackAppCredentials,
  TSlackChannel,
  TSlackClient,
  TSlackOAuthInstall
} from "../services/dependencies";

export class FakeSlackClient implements TSlackClient {
  readonly posted: { botToken: string; channelId: string; message: TSlackMessage; limits?: TChatPostLimits }[] = [];

  // What the next OAuth callback hands to onInstall.
  nextInstall: Partial<TSlackOAuthInstall> = {};

  private readonly channelsByToken = new Map<string, TSlackChannel[]>();

  private readonly refusals = new Map<string, TChatPostRefusal>();

  setChannels = (botToken: string, channels: TSlackChannel[]) => {
    this.channelsByToken.set(botToken, channels);
  };

  refuse = (channelId: string, refusal: TChatPostRefusal) => {
    this.refusals.set(channelId, refusal);
  };

  generateInstallUrl = async (input: { credentials: TSlackAppCredentials; metadata: string; redirectUri: string }) =>
    `https://slack.test/install?client_id=${encodeURIComponent(input.credentials.clientId)}&redirect_uri=${encodeURIComponent(input.redirectUri)}&metadata=${encodeURIComponent(input.metadata)}`;

  handleOAuthCallback = async (input: {
    credentials: TSlackAppCredentials;
    request: IncomingMessage;
    response: ServerResponse;
    onInstall(install: TSlackOAuthInstall): Promise<void>;
    onSuccess(metadata: string | undefined): Promise<void>;
    onFailure(): Promise<void>;
  }) => {
    const install: TSlackOAuthInstall = {
      isEnterpriseInstall: false,
      metadata: undefined,
      teamId: "T1",
      teamName: "Team",
      slackUserId: "U1",
      slackAppId: "A1",
      botAccessToken: "xoxb-fake",
      slackBotId: "B1",
      slackBotUserId: "UB1",
      ...this.nextInstall
    };

    try {
      await input.onInstall(install);
    } catch {
      await input.onFailure();
      return;
    }
    await input.onSuccess(install.metadata);
  };

  listChannels = async (botToken: string) => this.channelsByToken.get(botToken) ?? [];

  postMessage = async (input: {
    botToken: string;
    channelId: string;
    message: TSlackMessage;
    limits?: TChatPostLimits;
  }) => {
    this.posted.push({
      botToken: input.botToken,
      channelId: input.channelId,
      message: input.message,
      limits: input.limits
    });
    return this.refusals.get(input.channelId) ?? null;
  };
}
