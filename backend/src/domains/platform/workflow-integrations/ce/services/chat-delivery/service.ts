import { RuleViolationError } from "@app/domains/lib/errors";
import { TTransactionRunner } from "@app/domains/lib/transactions";
import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { KmsDataKey, TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { logger } from "@app/lib/logger";

import { ChatMessage } from "../../models/chat-message";
import { ChatPostFailure, WorkflowIntegrationProvider } from "../../models/enums";
import { MicrosoftTeamsTokenKind } from "../../models/microsoft-teams-installation";
import { WorkflowIntegration } from "../../models/workflow-integration";
import {
  TChatPostLimits,
  TChatPostRefusal,
  TMicrosoftTeamsBot,
  TMicrosoftTeamsClient,
  TSlackClient,
  TWorkflowIntegrationsStores,
  TWorkflowIntegrationStore
} from "../dependencies";
import { configuredMicrosoftTeamsCredentials, microsoftTeamsToken } from "../helpers/microsoft-teams-access";

export type TPostChatMessageInput = {
  orgId: string;
  integrationId: string;
  message: ChatMessage;
  channelIds: string[];
  // Microsoft Teams only: the team the channels belong to.
  teamId?: string;
  limits?: TChatPostLimits;
};

export type TChannelOutcome =
  | { channelId: string; delivered: true }
  | ({ channelId: string; delivered: false } & TChatPostRefusal);

// integrationMissing: the id is not an integration of the org (deleted, or never was), so nothing was sent.
export type TChatPostResult = { integrationMissing: true } | { integrationMissing: false; channels: TChannelOutcome[] };

const toOutcome = (channelId: string, refusal: TChatPostRefusal | null): TChannelOutcome =>
  refusal ? { channelId, delivered: false, ...refusal } : { channelId, delivered: true };

const failEvery = (channelIds: string[], error: unknown): TChannelOutcome[] =>
  channelIds.map((channelId) => ({
    channelId,
    delivered: false,
    failure: ChatPostFailure.Other,
    providerError: error instanceof Error ? error.message : undefined
  }));

export type TChatDeliveryService = {
  // Posts the message to each channel, one at a time. A channel that refuses is reported and the rest still get it;
  // it never throws for a refused channel, an unreachable provider or an id it cannot post to.
  post(input: TPostChatMessageInput): Promise<TChatPostResult>;
};

export class ChatDeliveryService implements TChatDeliveryService {
  constructor(
    private readonly transactionRunner: TTransactionRunner<TWorkflowIntegrationsStores>,
    private readonly workflowIntegrationStore: TWorkflowIntegrationStore,
    private readonly kmsDataKeyService: TKmsDataKeyService,
    private readonly instanceConfigService: TInstanceConfigService,
    private readonly slackClient: TSlackClient,
    private readonly microsoftTeamsClient: TMicrosoftTeamsClient,
    private readonly microsoftTeamsBot: TMicrosoftTeamsBot,
    private readonly now: () => Date
  ) {}

  async post(input: TPostChatMessageInput): Promise<TChatPostResult> {
    const integration = await this.workflowIntegrationStore.findById(input.integrationId);
    // A message for the other provider has nowhere to go here, the same as an id that is not this org's.
    if (!integration || integration.orgId !== input.orgId || !integration.isProvider(input.message.provider)) {
      return { integrationMissing: true };
    }

    const channels =
      integration.provider === WorkflowIntegrationProvider.Slack
        ? await this.postToSlack(integration, input)
        : await this.postToMicrosoftTeams(integration, input);
    return { integrationMissing: false, channels };
  }

  private async postToSlack(integration: WorkflowIntegration, input: TPostChatMessageInput) {
    const record = input.message.toJSON();
    if (record.provider !== WorkflowIntegrationProvider.Slack) return [];

    let botToken: string;
    try {
      const { decryptor } = await this.kmsDataKeyService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId: integration.orgId
      });
      botToken = decryptor({
        cipherTextBlob: integration.slackInstallation().encryptedBotAccessToken
      }).toString("utf8");
    } catch (error) {
      logger.error(error, `Unable to read the Slack bot token [integrationId=${integration.id}]`);
      return failEvery(input.channelIds, error);
    }

    const outcomes: TChannelOutcome[] = [];
    for (const channelId of input.channelIds) {
      // eslint-disable-next-line no-await-in-loop -- one channel at a time keeps us under Slack's per-workspace rate limit
      const refusal = await this.slackClient.postMessage({
        botToken,
        channelId,
        message: record.slack,
        limits: input.limits
      });
      outcomes.push(toOutcome(channelId, refusal));
    }
    return outcomes;
  }

  private async postToMicrosoftTeams(integration: WorkflowIntegration, input: TPostChatMessageInput) {
    const record = input.message.toJSON();
    if (record.provider !== WorkflowIntegrationProvider.MicrosoftTeams) return [];
    const { teamId } = input;
    if (!teamId)
      throw new RuleViolationError({ message: "A Microsoft Teams message needs the team its channels are in" });

    let botToken: string;
    try {
      if (!this.microsoftTeamsBot.isInitialized()) {
        throw new RuleViolationError({
          message: "Unable to send notification because the Microsoft Teams bot is uninitialized"
        });
      }
      const credentials = await configuredMicrosoftTeamsCredentials(this.instanceConfigService);
      botToken = await microsoftTeamsToken(
        {
          transactionRunner: this.transactionRunner,
          kmsDataKeyService: this.kmsDataKeyService,
          instanceConfigService: this.instanceConfigService,
          microsoftTeamsClient: this.microsoftTeamsClient,
          now: this.now
        },
        integration,
        credentials,
        MicrosoftTeamsTokenKind.BotFramework
      );
    } catch (error) {
      logger.error(error, `Unable to post to Microsoft Teams [integrationId=${integration.id}]`);
      const providerError = error instanceof Error ? error.message : undefined;
      return input.channelIds.map((channelId): TChannelOutcome => ({
        channelId,
        delivered: false,
        failure: ChatPostFailure.Other,
        providerError
      }));
    }

    const outcomes: TChannelOutcome[] = [];
    for (const channelId of input.channelIds) {
      // eslint-disable-next-line no-await-in-loop -- in order, so a channel list reads top to bottom in the team
      const refusal = await this.microsoftTeamsClient.sendChannelCard({
        botToken,
        teamId,
        channelId,
        adaptiveCard: record.microsoftTeams.adaptiveCard
      });
      outcomes.push(toOutcome(channelId, refusal));
    }
    return outcomes;
  }
}
