/* eslint-disable class-methods-use-this */
import type { IncomingMessage, ServerResponse } from "node:http";

import { InstallProvider } from "@slack/oauth";
import { WebClient } from "@slack/web-api";

import { logger } from "@app/lib/logger";

import { TSlackMessage } from "../../models/chat-message";
import {
  TChatPostLimits,
  TChatPostRefusal,
  TSlackAppCredentials,
  TSlackChannel,
  TSlackClient,
  TSlackOAuthInstall
} from "../../services/dependencies";
import { toChatPostRefusal } from "./errors";

const SLACK_SCOPES = ["chat:write.public", "chat:write", "channels:read", "groups:read"];
const CHANNEL_LIST_MAX_PAGES = 50;
const CHANNEL_LIST_TIMEOUT_MS = 10 * 1000;

export class SlackClient implements TSlackClient {
  constructor(private readonly stateSecret: string) {}

  generateInstallUrl(input: { credentials: TSlackAppCredentials; metadata: string; redirectUri: string }) {
    const installer = this.buildInstaller(input.credentials, async () => {});
    return installer.generateInstallUrl({
      scopes: SLACK_SCOPES,
      metadata: input.metadata,
      redirectUri: input.redirectUri
    });
  }

  async handleOAuthCallback(input: {
    credentials: TSlackAppCredentials;
    request: IncomingMessage;
    response: ServerResponse;
    onInstall(install: TSlackOAuthInstall): Promise<void>;
    onSuccess(metadata: string | undefined): Promise<void>;
    onFailure(): Promise<void>;
  }) {
    const installer = this.buildInstaller(input.credentials, (install) => input.onInstall(install));
    await installer.handleCallback(input.request, input.response, {
      failureAsync: async () => {
        await input.onFailure();
      },
      successAsync: async (installation) => {
        await input.onSuccess(installation.metadata);
      }
    });
  }

  async listChannels(botToken: string): Promise<TSlackChannel[]> {
    const channels: TSlackChannel[] = [];

    // The SDK's default retry policy waits out rate limits for up to half an hour, which would hang the request.
    const client = new WebClient(botToken, {
      timeout: CHANNEL_LIST_TIMEOUT_MS,
      retryConfig: { retries: 2, maxRetryTime: CHANNEL_LIST_TIMEOUT_MS },
      rejectRateLimitedCalls: true
    });
    let cursor: string | undefined;
    let page = 0;

    do {
      page += 1;
      // eslint-disable-next-line no-await-in-loop
      const response = await client.conversations.list({
        cursor,
        limit: 1000,
        types: "public_channel,private_channel"
      });

      response.channels?.forEach((channel) =>
        channels.push({
          name: channel.name_normalized as string,
          id: channel.id as string,
          isArchived: Boolean(channel.is_archived)
        })
      );

      cursor = response.response_metadata?.next_cursor || undefined;
    } while (cursor && page < CHANNEL_LIST_MAX_PAGES);

    if (cursor) {
      logger.warn(
        `Slack channel listing stopped after ${CHANNEL_LIST_MAX_PAGES} pages; returning the first ${channels.length} channels`
      );
    }

    return channels;
  }

  async postMessage(input: {
    botToken: string;
    channelId: string;
    message: TSlackMessage;
    limits?: TChatPostLimits;
  }): Promise<TChatPostRefusal | null> {
    const { limits } = input;
    // Without limits the SDK's defaults apply; with them a rate-limited call fails at once instead of waiting.
    const client = limits
      ? new WebClient(input.botToken, {
          timeout: limits.timeoutMs,
          retryConfig: { retries: limits.retries, maxRetryTime: limits.timeoutMs },
          rejectRateLimitedCalls: true
        })
      : new WebClient(input.botToken);

    try {
      await client.chat.postMessage({
        channel: input.channelId,
        text: input.message.text,
        blocks: input.message.blocks as never,
        attachments: input.message.attachments as never
      });
      return null;
    } catch (err) {
      return toChatPostRefusal(err);
    }
  }

  private buildInstaller(credentials: TSlackAppCredentials, onInstall: (install: TSlackOAuthInstall) => Promise<void>) {
    return new InstallProvider({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      stateSecret: this.stateSecret,
      legacyStateVerification: true,
      installationStore: {
        storeInstallation: async (installation) => {
          await onInstall({
            isEnterpriseInstall: Boolean(installation.isEnterpriseInstall && installation.enterprise?.id),
            metadata: installation.metadata,
            teamId: installation.team?.id || "",
            teamName: installation.team?.name || "",
            slackUserId: installation.user.id,
            slackAppId: installation.appId || "",
            botAccessToken: installation.bot?.token || "",
            slackBotId: installation.bot?.id || "",
            slackBotUserId: installation.bot?.userId || ""
          });
        },
        // Only used when listening for Slack events, which this app does not.
        fetchInstallation: () => {
          return {} as never;
        },
        deleteInstallation: () => {
          return {} as never;
        }
      }
    });
  }
}
