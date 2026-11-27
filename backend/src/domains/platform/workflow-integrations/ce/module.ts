import { TDbClient } from "@app/db";
import { poolStoreConnection, singleStoreConnection } from "@app/domains/lib/data-access";
import { TransactionRunner, TTransactionRunner } from "@app/domains/lib/transactions";
import type { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import type { TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import type { TOrgPermissionService } from "@app/domains/platform/organizations/ce/module";
import type { startLocalRefresh } from "@app/lib/cron/local-refresh";
import { logger } from "@app/lib/logger";

import { MicrosoftTeamsBot } from "./clients/microsoft-teams/bot";
import { MicrosoftTeamsClient } from "./clients/microsoft-teams/client";
import { SlackClient } from "./clients/slack/client";
import { WorkflowIntegrationStore } from "./data-access/workflow-integration-store";
import { ChatDeliveryService, TChatDeliveryService } from "./services/chat-delivery/service";
import {
  TMicrosoftTeamsBot,
  TMicrosoftTeamsClient,
  TSlackClient,
  TWorkflowIntegrationsStores,
  TWorkflowIntegrationStore
} from "./services/dependencies";
import {
  MicrosoftTeamsIntegrationService,
  TMicrosoftTeamsIntegrationService
} from "./services/microsoft-teams-integration/service";
import { SlackIntegrationService, TSlackIntegrationService } from "./services/slack-integration/service";
import { TWorkflowIntegrationService, WorkflowIntegrationService } from "./services/workflow-integration/service";

export { ChatMessage } from "./models/chat-message";
export type { TMicrosoftTeamsMessage, TSlackMessage } from "./models/chat-message";
export { ChatPostFailure, WorkflowIntegrationProvider, WorkflowIntegrationStatus } from "./models/enums";
export { WorkflowIntegration } from "./models/workflow-integration";
export type {
  TChannelOutcome,
  TChatDeliveryService,
  TChatPostResult,
  TPostChatMessageInput
} from "./services/chat-delivery/service";
export type {
  TBotRequest,
  TChatPostLimits,
  TChatPostRefusal,
  TMicrosoftTeamsTeam,
  TSlackChannel
} from "./services/dependencies";
export type { TMicrosoftTeamsIntegrationService } from "./services/microsoft-teams-integration/service";
export type { TSlackIntegrationService } from "./services/slack-integration/service";
export { registerWorkflowIntegrationsRouter } from "./router/workflow-integrations-router";
export type { TWorkflowIntegrationsRouterDeps } from "./router/types";
export type { TFindInOrgInput, TWorkflowIntegrationService } from "./services/workflow-integration/service";

type TWorkflowIntegrationsStoreAccess = {
  transactionRunner: TTransactionRunner<TWorkflowIntegrationsStores>;
  // Outside a transaction: the replica on the server.
  workflowIntegrationStore: TWorkflowIntegrationStore;
};

export type TWorkflowIntegrationsDeps = (
  | { db: TDbClient }
  // Tests pass in-memory stores instead.
  | TWorkflowIntegrationsStoreAccess
) & {
  orgPermissionService: TOrgPermissionService;
  kmsDataKeyService: TKmsDataKeyService;
  instanceConfigService: TInstanceConfigService;
  siteUrl: string | undefined;
  // Signs Slack's OAuth state.
  authSecret: string;
  isCloud: boolean;
  isProductionMode: boolean;
  // Injected because the timer module must not load with this one.
  startLocalRefresh: typeof startLocalRefresh;
  // Tests pass fakes; the server uses the real clients.
  slackClient?: TSlackClient;
  microsoftTeamsClient?: TMicrosoftTeamsClient;
  microsoftTeamsBot?: TMicrosoftTeamsBot;
  now?: () => Date;
};

const TEAMS_CONFIG_SYNC_INTERVAL_MS = 5 * 60 * 1000;

const buildStoreAccess = (db: TDbClient): TWorkflowIntegrationsStoreAccess => ({
  transactionRunner: new TransactionRunner<TWorkflowIntegrationsStores>(db, (trx, locks) => ({
    workflowIntegrationStore: new WorkflowIntegrationStore(singleStoreConnection(trx)),
    locks
  })),
  workflowIntegrationStore: new WorkflowIntegrationStore(poolStoreConnection(db))
});

// Slack and Microsoft Teams app installs for an org, and posting to their channels. Products keep their own "post
// what, where and when" settings and call chatDeliveryService. Depends on Organizations (permissions), KMS Core
// (the org data key that encrypts bot tokens) and Instance Config Core (the instance's app credentials).
export class WorkflowIntegrationsModule {
  readonly workflowIntegrationService: TWorkflowIntegrationService;

  readonly slackIntegrationService: TSlackIntegrationService;

  readonly microsoftTeamsIntegrationService: TMicrosoftTeamsIntegrationService;

  readonly chatDeliveryService: TChatDeliveryService;

  constructor(private readonly deps: TWorkflowIntegrationsDeps) {
    const { transactionRunner, workflowIntegrationStore } = "db" in deps ? buildStoreAccess(deps.db) : deps;
    const { orgPermissionService, kmsDataKeyService, instanceConfigService } = deps;
    const slackClient = deps.slackClient ?? new SlackClient(deps.authSecret);
    const microsoftTeamsClient = deps.microsoftTeamsClient ?? new MicrosoftTeamsClient();
    const microsoftTeamsBot = deps.microsoftTeamsBot ?? new MicrosoftTeamsBot();
    const now = deps.now ?? (() => new Date());

    this.workflowIntegrationService = new WorkflowIntegrationService(workflowIntegrationStore, orgPermissionService);
    this.slackIntegrationService = new SlackIntegrationService(
      transactionRunner,
      workflowIntegrationStore,
      orgPermissionService,
      kmsDataKeyService,
      instanceConfigService,
      slackClient,
      { siteUrl: deps.siteUrl, isCloud: deps.isCloud }
    );
    this.microsoftTeamsIntegrationService = new MicrosoftTeamsIntegrationService(
      transactionRunner,
      workflowIntegrationStore,
      orgPermissionService,
      kmsDataKeyService,
      instanceConfigService,
      microsoftTeamsClient,
      microsoftTeamsBot,
      now
    );
    this.chatDeliveryService = new ChatDeliveryService(
      transactionRunner,
      workflowIntegrationStore,
      kmsDataKeyService,
      instanceConfigService,
      slackClient,
      microsoftTeamsClient,
      microsoftTeamsBot,
      now
    );
  }

  // Call once at boot: builds the Teams bot from the instance credentials.
  async start(): Promise<void> {
    await this.microsoftTeamsIntegrationService.start();
  }

  // Every pod rebuilds its own Teams bot when another pod saved new credentials. Production only.
  startBackgroundSync() {
    if (!this.deps.isProductionMode) return undefined;
    logger.info("Setting up background sync process for Microsoft Teams workflow integration configuration");
    void this.microsoftTeamsIntegrationService.syncBotWithConfig().catch((error: unknown) => {
      logger.error(error, "Error syncing Microsoft Teams integration configuration");
    });
    return this.deps.startLocalRefresh({
      name: "microsoft-teams-config-sync",
      intervalMs: TEAMS_CONFIG_SYNC_INTERVAL_MS,
      task: () => this.microsoftTeamsIntegrationService.syncBotWithConfig()
    });
  }
}
