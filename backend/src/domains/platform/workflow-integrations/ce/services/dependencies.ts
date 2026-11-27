import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

import { TReadOptions } from "@app/domains/lib/data-access";
import { TStoreLocks } from "@app/domains/lib/transactions";

import { TSlackMessage } from "../models/chat-message";
import { ChatPostFailure, WorkflowIntegrationProvider, WorkflowIntegrationStatus } from "../models/enums";
import { MicrosoftTeamsTokenKind } from "../models/microsoft-teams-installation";
import { WorkflowIntegration } from "../models/workflow-integration";

export type TWorkflowIntegrationFilter = {
  provider?: WorkflowIntegrationProvider;
  status?: WorkflowIntegrationStatus;
};

// Owns workflow_integrations, slack_integrations and microsoft_teams_integrations.
export type TWorkflowIntegrationStore = {
  findById(id: string, options?: TReadOptions): Promise<WorkflowIntegration | null>;
  // Locks both rows for the rest of the transaction.
  findByIdForUpdate(id: string): Promise<WorkflowIntegration | null>;
  // Oldest first.
  listByOrg(orgId: string, filter?: TWorkflowIntegrationFilter, options?: TReadOptions): Promise<WorkflowIntegration[]>;
  listByIds(ids: string[], options?: TReadOptions): Promise<WorkflowIntegration[]>;
  // Any Teams integration for the tenant; the oldest when there are several.
  findMicrosoftTeamsByTenantId(tenantId: string, options?: TReadOptions): Promise<WorkflowIntegration | null>;
  // Writes the workflow_integrations row and the provider's row under the same id.
  create(integration: WorkflowIntegration): Promise<void>;
  // Writes every field of both rows.
  save(integration: WorkflowIntegration): Promise<void>;
  // The provider's row goes with it (FK cascade).
  delete(id: string): Promise<void>;
};

export type TWorkflowIntegrationsStores = {
  workflowIntegrationStore: TWorkflowIntegrationStore;
  locks: TStoreLocks;
};

export type TSlackAppCredentials = { clientId: string; clientSecret: string };

// What Slack's OAuth callback hands over. `metadata` is the string given to generateInstallUrl.
export type TSlackOAuthInstall = {
  isEnterpriseInstall: boolean;
  metadata: string | undefined;
  teamId: string;
  teamName: string;
  slackUserId: string;
  slackAppId: string;
  botAccessToken: string;
  slackBotId: string;
  slackBotUserId: string;
};

export type TSlackChannel = { id: string; name: string; isArchived: boolean };

// For callers that cannot wait (alert dispatch): the call times out after timeoutMs, retries at most `retries` times
// within that time, and a rate-limited call fails at once as RateLimited instead of waiting. Without limits the
// provider SDK's defaults apply.
export type TChatPostLimits = { timeoutMs: number; retries: number };

// Why a channel did not get the message. providerError is the provider's own code when it gave one (Slack's
// `data.error`), for callers that word their own message.
export type TChatPostRefusal = { failure: ChatPostFailure; providerError?: string };

export type TSlackClient = {
  generateInstallUrl(input: {
    credentials: TSlackAppCredentials;
    metadata: string;
    redirectUri: string;
  }): Promise<string>;
  // Verifies the OAuth state, exchanges the code, then calls onInstall. A throw from onInstall, or any other failure,
  // ends in onFailure; success in onSuccess with the install's metadata.
  handleOAuthCallback(input: {
    credentials: TSlackAppCredentials;
    request: IncomingMessage;
    response: ServerResponse;
    onInstall(install: TSlackOAuthInstall): Promise<void>;
    onSuccess(metadata: string | undefined): Promise<void>;
    onFailure(): Promise<void>;
  }): Promise<void>;
  // Public and private channels the bot can see, capped at 50 pages so a huge workspace cannot hang the request.
  listChannels(botToken: string): Promise<TSlackChannel[]>;
  // null when Slack accepted the message.
  postMessage(input: {
    botToken: string;
    channelId: string;
    message: TSlackMessage;
    limits?: TChatPostLimits;
  }): Promise<TChatPostRefusal | null>;
};

export type TMicrosoftTeamsAppCredentials = { appId: string; clientSecret: string; botId: string };

export type TIssuedToken = { accessToken: string; expiresAt: Date };

export type TMicrosoftTeamsTeam = {
  teamId: string;
  teamName: string;
  channels: { channelId: string; channelName: string }[];
};

export type TTenantConsentOutcome =
  | { verified: true }
  // Entra answered AADSTS65001: no admin consent for the app in the tenant.
  | { verified: false; reason: "consent-required" }
  // A token was issued by another tenant. `token` says which exchange: client credentials or the consent code.
  | { verified: false; reason: "tenant-mismatch"; token: "application" | "authorization"; issuedByTenantId: string };

export type TMicrosoftTeamsClient = {
  // Exchanges an app token and the admin-consent code, and checks both were issued by `tenantId`. Any other failure
  // is an ExternalSystemError.
  verifyTenantConsent(input: {
    credentials: TMicrosoftTeamsAppCredentials;
    tenantId: string;
    code: string;
    redirectUri: string;
  }): Promise<TTenantConsentOutcome>;
  issueToken(input: {
    credentials: TMicrosoftTeamsAppCredentials;
    tenantId: string;
    kind: MicrosoftTeamsTokenKind;
  }): Promise<TIssuedToken>;
  // The bot's entry in the tenant's app catalog, or null when it is not there or the catalog cannot be read.
  findInstalledApp(input: { graphToken: string; botId: string }): Promise<{ internalAppId: string } | null>;
  // Teams the app is installed in, each with its channels.
  listTeamsWithChannels(input: { graphToken: string; internalAppId: string }): Promise<TMicrosoftTeamsTeam[]>;
  // null when Teams accepted the message.
  sendChannelCard(input: {
    botToken: string;
    teamId: string;
    channelId: string;
    adaptiveCard: Record<string, unknown>;
  }): Promise<TChatPostRefusal | null>;
};

// An inbound Bot Framework call, as the route received it.
export type TBotRequest = {
  body: Record<string, unknown>;
  headers: IncomingHttpHeaders;
  method: string;
  response: ServerResponse;
};

// The process's Teams bot: built from the instance credentials, rebuilt when they change.
export type TMicrosoftTeamsBot = {
  initialize(input: { appId: string; clientSecret: string }): void;
  isInitialized(): boolean;
  // Authenticates the call (Bot Framework JWT) and dispatches it. onBotAdded runs when the bot joins a tenant's team.
  process(request: TBotRequest, onBotAdded: (tenantId: string) => Promise<void>): Promise<void>;
};
