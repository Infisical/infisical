import { TActorContext } from "@app/domains/lib/actor-context";
import { ReadFrom } from "@app/domains/lib/data-access";
import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";
import { TTransactionRunner } from "@app/domains/lib/transactions";
import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { KmsDataKey, TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  TOrgPermissionService
} from "@app/domains/platform/organizations/ce/module";
import { logger } from "@app/lib/logger";

import { WorkflowIntegrationProvider, WorkflowIntegrationStatus } from "../../models/enums";
import { MicrosoftTeamsTokenKind } from "../../models/microsoft-teams-installation";
import { WorkflowIntegration } from "../../models/workflow-integration";
import {
  TBotRequest,
  TMicrosoftTeamsAppCredentials,
  TMicrosoftTeamsBot,
  TMicrosoftTeamsClient,
  TMicrosoftTeamsTeam,
  TTenantConsentOutcome,
  TWorkflowIntegrationsStores,
  TWorkflowIntegrationStore
} from "../dependencies";
import {
  configuredMicrosoftTeamsCredentials,
  probeMicrosoftTeamsInstall,
  TMicrosoftTeamsAccessDeps
} from "../helpers/microsoft-teams-access";

const BOT_NOT_INSTALLED_MESSAGE = "Microsoft Teams bot is not installed in the configured Microsoft Teams Tenant";

export type TCompleteMicrosoftTeamsIntegrationInput = {
  actor: TActorContext;
  tenantId: string;
  slug: string;
  description?: string;
  code: string;
  redirectUri: string;
};

export type TMicrosoftTeamsIntegrationService = {
  getClientId(input: { actor: TActorContext }): Promise<string>;
  // Verifies the tenant's admin consent, then creates the integration: installed when the bot is already in the
  // tenant, pending otherwise.
  complete(input: TCompleteMicrosoftTeamsIntegrationInput): Promise<WorkflowIntegration>;
  // Installed integrations only.
  list(input: { actor: TActorContext }): Promise<WorkflowIntegration[]>;
  getById(input: { actor: TActorContext; id: string }): Promise<WorkflowIntegration>;
  update(input: {
    actor: TActorContext;
    id: string;
    slug?: string;
    description?: string;
  }): Promise<WorkflowIntegration>;
  // Returns the integration as it was.
  delete(input: { actor: TActorContext; id: string }): Promise<WorkflowIntegration>;
  // Asks Microsoft whether the bot is in the tenant and records the answer; refuses when it is not.
  checkInstallationStatus(input: { actor: TActorContext; id: string }): Promise<WorkflowIntegration>;
  getTeams(input: {
    actor: TActorContext;
    id: string;
  }): Promise<{ integration: WorkflowIntegration; teams: TMicrosoftTeamsTeam[] }>;
  // An inbound Bot Framework call.
  handleBotMessage(request: TBotRequest): Promise<void>;
  // Builds the bot from the instance credentials when they are complete. Logs instead of throwing.
  start(): Promise<void>;
  // Rebuilds the bot after the instance credentials changed on this pod.
  reinitializeBot(input: { appId: string; clientSecret: string; configUpdatedAt: Date }): void;
  // Rebuilds the bot when the instance credentials changed since the last build (another pod saved them). Throws, so
  // the refresh records a failed run.
  syncBotWithConfig(): Promise<void>;
};

const consentRefusal = (tenantId: string, outcome: TTenantConsentOutcome): string | null => {
  if (outcome.verified) return null;
  if (outcome.reason === "consent-required") {
    return "Unable to verify tenant, please ensure that you have granted admin consent.";
  }
  const token = outcome.token === "application" ? "application" : "authorization";
  return `Invalid ${token} token tenant ID. Expected ${tenantId}, got ${outcome.issuedByTenantId}`;
};

export class MicrosoftTeamsIntegrationService implements TMicrosoftTeamsIntegrationService {
  private lastKnownConfigUpdatedAt = new Date();

  constructor(
    private readonly transactionRunner: TTransactionRunner<TWorkflowIntegrationsStores>,
    private readonly workflowIntegrationStore: TWorkflowIntegrationStore,
    private readonly orgPermissionService: TOrgPermissionService,
    private readonly kmsDataKeyService: TKmsDataKeyService,
    private readonly instanceConfigService: TInstanceConfigService,
    private readonly microsoftTeamsClient: TMicrosoftTeamsClient,
    private readonly microsoftTeamsBot: TMicrosoftTeamsBot,
    private readonly now: () => Date
  ) {}

  async getClientId({ actor }: { actor: TActorContext }): Promise<string> {
    const permission = await this.orgPermissionService.getOrgPermission({ actor });
    permission.assert({ action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Settings });

    const { credentials } = await this.instanceConfigService.getMicrosoftTeamsCredentials();
    if (!credentials.appId) throw new RuleViolationError({ message: "Microsoft Teams app ID is not set" });
    return credentials.appId;
  }

  async complete({
    actor,
    tenantId,
    slug,
    description,
    code,
    redirectUri
  }: TCompleteMicrosoftTeamsIntegrationInput): Promise<WorkflowIntegration> {
    const permission = await this.orgPermissionService.getOrgPermission({ actor });
    permission.assert({ action: OrgPermissionActions.Create, subject: OrgPermissionSubjects.Settings });

    const credentials = await configuredMicrosoftTeamsCredentials(this.instanceConfigService);
    const refusal = consentRefusal(
      tenantId,
      await this.microsoftTeamsClient.verifyTenantConsent({ credentials, tenantId, code, redirectUri })
    );
    if (refusal) throw new RuleViolationError({ message: refusal });

    const integration = WorkflowIntegration.createMicrosoftTeams({ orgId: actor.org.id, slug, description, tenantId });
    await this.installBot(integration, credentials);
    await this.transactionRunner.run(({ stores }) => stores.workflowIntegrationStore.create(integration));
    return integration;
  }

  async list({ actor }: { actor: TActorContext }): Promise<WorkflowIntegration[]> {
    const permission = await this.orgPermissionService.getOrgPermission({ actor });
    permission.assert({ action: OrgPermissionActions.Create, subject: OrgPermissionSubjects.Settings });
    return this.workflowIntegrationStore.listByOrg(actor.org.id, {
      provider: WorkflowIntegrationProvider.MicrosoftTeams,
      status: WorkflowIntegrationStatus.Installed
    });
  }

  async getById({ actor, id }: { actor: TActorContext; id: string }): Promise<WorkflowIntegration> {
    const integration = await this.findTeams(id, "Microsoft Teams integration not found.");
    await this.assertPermission(actor, integration, OrgPermissionActions.Read);
    return integration;
  }

  async update({
    actor,
    id,
    slug,
    description
  }: {
    actor: TActorContext;
    id: string;
    slug?: string;
    description?: string;
  }): Promise<WorkflowIntegration> {
    const integration = await this.findTeams(id, `Microsoft Teams integration with ID ${id} not found`);
    await this.assertPermission(actor, integration, OrgPermissionActions.Edit);

    return this.transactionRunner.run(async ({ stores }) => {
      const current = await stores.workflowIntegrationStore.findByIdForUpdate(id);
      if (!current) throw new EntityNotFoundError({ message: `Microsoft Teams integration with ID ${id} not found` });
      current.rename({ slug, description });
      await stores.workflowIntegrationStore.save(current);
      return current;
    });
  }

  async delete({ actor, id }: { actor: TActorContext; id: string }): Promise<WorkflowIntegration> {
    const integration = await this.findTeams(id, `Microsoft Teams integration with ID ${id} not found`);
    await this.assertPermission(actor, integration, OrgPermissionActions.Delete);

    await this.transactionRunner.run(({ stores }) => stores.workflowIntegrationStore.delete(id));
    return integration;
  }

  async checkInstallationStatus({ actor, id }: { actor: TActorContext; id: string }): Promise<WorkflowIntegration> {
    const integration = await this.findTeams(id, `Microsoft Teams integration with ID ${id} not found`);
    await this.assertPermission(actor, integration, OrgPermissionActions.Edit);

    const credentials = await configuredMicrosoftTeamsCredentials(this.instanceConfigService);
    const probe = await probeMicrosoftTeamsInstall(this.accessDeps(), integration, credentials);

    const status = await this.transactionRunner.run(async ({ stores }) => {
      const current = await stores.workflowIntegrationStore.findByIdForUpdate(id);
      if (!current) throw new EntityNotFoundError({ message: `Microsoft Teams integration with ID ${id} not found` });
      if (probe.installed && !current.isInstalled()) current.markInstalled();
      else if (!probe.installed && current.isInstalled()) current.markPending();
      else return current;
      await stores.workflowIntegrationStore.save(current);
      return current;
    });

    if (!probe.installed) throw new RuleViolationError({ message: BOT_NOT_INSTALLED_MESSAGE });
    return status;
  }

  async getTeams({
    actor,
    id
  }: {
    actor: TActorContext;
    id: string;
  }): Promise<{ integration: WorkflowIntegration; teams: TMicrosoftTeamsTeam[] }> {
    const integration = await this.findTeams(id, `Microsoft Teams integration with ID ${id} not found`);
    await this.assertPermission(actor, integration, OrgPermissionActions.Read);

    if (!this.microsoftTeamsBot.isInitialized()) {
      throw new RuleViolationError({
        message: "Unable to get teams and channels because the Microsoft Teams bot is uninitialized"
      });
    }

    const credentials = await configuredMicrosoftTeamsCredentials(this.instanceConfigService);
    const probe = await probeMicrosoftTeamsInstall(this.accessDeps(), integration, credentials);
    if (!probe.installed) throw new RuleViolationError({ message: BOT_NOT_INSTALLED_MESSAGE });

    const teams = await this.microsoftTeamsClient.listTeamsWithChannels({
      graphToken: probe.graphToken,
      internalAppId: probe.internalAppId
    });
    return { integration, teams };
  }

  async handleBotMessage(request: TBotRequest): Promise<void> {
    await this.microsoftTeamsBot.process(request, (tenantId) => this.markTenantInstalled(tenantId));
  }

  async start(): Promise<void> {
    try {
      const { credentials } = await this.instanceConfigService.getMicrosoftTeamsCredentials();
      if (credentials.isComplete()) {
        this.initializeBot(credentials.appId, credentials.clientSecret);
      }
    } catch (error) {
      logger.error(error, "Error initializing Microsoft Teams bot on startup");
    }
  }

  reinitializeBot({
    appId,
    clientSecret,
    configUpdatedAt
  }: {
    appId: string;
    clientSecret: string;
    configUpdatedAt: Date;
  }): void {
    this.initializeBot(appId, clientSecret);
    this.lastKnownConfigUpdatedAt = configUpdatedAt;
  }

  async syncBotWithConfig(): Promise<void> {
    const { credentials, configUpdatedAt } = await this.instanceConfigService.getMicrosoftTeamsCredentials();
    if (this.lastKnownConfigUpdatedAt.getTime() === configUpdatedAt.getTime()) {
      logger.info("No changes to Microsoft Teams integration configuration, skipping sync");
      return;
    }
    if (credentials.isComplete()) this.initializeBot(credentials.appId, credentials.clientSecret);
    // Only once the bot is up: marking the config seen before a failed build would make every later run skip it.
    this.lastKnownConfigUpdatedAt = configUpdatedAt;
  }

  private initializeBot(appId: string, clientSecret: string) {
    logger.info("Initializing Microsoft Teams bot");
    this.microsoftTeamsBot.initialize({ appId, clientSecret });
  }

  // The bot joined a team in `tenantId`: a pending integration for that tenant becomes installed.
  private async markTenantInstalled(tenantId: string): Promise<void> {
    const found = await this.workflowIntegrationStore.findMicrosoftTeamsByTenantId(tenantId, {
      readFrom: ReadFrom.Primary
    });
    if (!found) return;
    await this.transactionRunner.run(async ({ stores }) => {
      const current = await stores.workflowIntegrationStore.findByIdForUpdate(found.id);
      if (!current || current.status !== WorkflowIntegrationStatus.Pending) return;
      current.markInstalled();
      await stores.workflowIntegrationStore.save(current);
    });
  }

  // Asks Microsoft for both tokens and the bot's app before the integration is written, so no call to Microsoft runs
  // inside the transaction. Tokens Microsoft issued are kept even when the bot is not installed yet.
  private async installBot(integration: WorkflowIntegration, credentials: TMicrosoftTeamsAppCredentials) {
    const { tenantId } = integration.microsoftTeamsInstallation();
    const issue = (kind: MicrosoftTeamsTokenKind) =>
      this.microsoftTeamsClient.issueToken({ credentials, tenantId, kind }).catch((error: unknown) => {
        logger.error(error, `Failed to get a Microsoft Teams ${kind} token [tenantId=${tenantId}]`);
        return null;
      });
    const [botToken, graphToken] = [
      await issue(MicrosoftTeamsTokenKind.BotFramework),
      await issue(MicrosoftTeamsTokenKind.Graph)
    ];

    const { encryptor } = await this.kmsDataKeyService.createCipherPairWithDataKey({
      orgId: integration.orgId,
      type: KmsDataKey.Organization
    });
    const encrypt = (token: string) => encryptor({ plainText: Buffer.from(token, "utf8") }).cipherTextBlob;
    if (botToken) {
      integration.changeMicrosoftTeamsInstallation((teams) =>
        teams.withToken(MicrosoftTeamsTokenKind.BotFramework, encrypt(botToken.accessToken), botToken.expiresAt)
      );
    }
    if (graphToken) {
      integration.changeMicrosoftTeamsInstallation((teams) =>
        teams.withToken(MicrosoftTeamsTokenKind.Graph, encrypt(graphToken.accessToken), graphToken.expiresAt)
      );
    }
    if (!botToken || !graphToken) return;

    const app = await this.microsoftTeamsClient
      .findInstalledApp({ graphToken: graphToken.accessToken, botId: credentials.botId })
      .catch(() => null);
    if (!app) return;
    integration.changeMicrosoftTeamsInstallation((teams) => teams.withInternalAppId(app.internalAppId));
    integration.markInstalled();
  }

  private accessDeps(): TMicrosoftTeamsAccessDeps {
    return {
      transactionRunner: this.transactionRunner,
      kmsDataKeyService: this.kmsDataKeyService,
      instanceConfigService: this.instanceConfigService,
      microsoftTeamsClient: this.microsoftTeamsClient,
      now: this.now
    };
  }

  // Only Teams integrations count: a Slack id reads as missing, as the legacy join did.
  private async findTeams(id: string, notFoundMessage: string): Promise<WorkflowIntegration> {
    const integration = await this.workflowIntegrationStore.findById(id);
    if (!integration || !integration.isProvider(WorkflowIntegrationProvider.MicrosoftTeams)) {
      throw new EntityNotFoundError({ message: notFoundMessage });
    }
    return integration;
  }

  private async assertPermission(actor: TActorContext, integration: WorkflowIntegration, action: OrgPermissionActions) {
    const permission = await this.orgPermissionService.getOrgPermission({ actor, orgId: integration.orgId });
    permission.assert({ action, subject: OrgPermissionSubjects.Settings });
  }
}
