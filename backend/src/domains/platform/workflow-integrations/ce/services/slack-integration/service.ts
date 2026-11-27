import type { IncomingMessage, ServerResponse } from "node:http";

import { TActorContext } from "@app/domains/lib/actor-context";
import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";
import { TTransactionRunner } from "@app/domains/lib/transactions";
import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { KmsDataKey, TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  TOrgPermissionService
} from "@app/domains/platform/organizations/ce/module";

import { WorkflowIntegrationProvider } from "../../models/enums";
import { SlackInstallation } from "../../models/slack-installation";
import { WorkflowIntegration } from "../../models/workflow-integration";
import {
  TSlackAppCredentials,
  TSlackChannel,
  TSlackClient,
  TSlackOAuthInstall,
  TWorkflowIntegrationsStores,
  TWorkflowIntegrationStore
} from "../dependencies";

// Travels through Slack inside the signed OAuth state and comes back with the install.
type TInstallMetadata = { id?: string; orgId: string; slug: string; description?: string };

// The metadata is ours (it is signed into the OAuth state), so a parse failure means no Infisical install.
const parseMetadata = (metadata: string | undefined): TInstallMetadata | null => {
  try {
    return metadata ? (JSON.parse(metadata) as TInstallMetadata) : null;
  } catch {
    return null;
  }
};

export type TSlackIntegrationConfig = { siteUrl: string | undefined; isCloud: boolean };

export type THandleSlackOAuthCallbackInput = {
  request: IncomingMessage;
  response: ServerResponse;
  // orgId is undefined when the install's metadata names none.
  onSuccess: (orgId: string | undefined) => Promise<void>;
  onFailure: () => Promise<void>;
};

export type TSlackIntegrationService = {
  getInstallUrl(input: { actor: TActorContext; slug: string; description?: string }): Promise<string>;
  getReinstallUrl(input: { actor: TActorContext; id: string }): Promise<string>;
  // Slack's redirect after an install: creates the integration, or reinstalls it when the URL came from
  // getReinstallUrl.
  handleOAuthCallback(input: THandleSlackOAuthCallbackInput): Promise<void>;
  list(input: { actor: TActorContext }): Promise<WorkflowIntegration[]>;
  getById(input: { actor: TActorContext; id: string }): Promise<WorkflowIntegration>;
  // getById's check with the "with ID" not-found message, for routes outside this domain that read about it.
  assertCanRead(input: { actor: TActorContext; id: string }): Promise<WorkflowIntegration>;
  listChannels(input: { actor: TActorContext; id: string }): Promise<TSlackChannel[]>;
  update(input: {
    actor: TActorContext;
    id: string;
    slug?: string;
    description?: string;
  }): Promise<WorkflowIntegration>;
  // Returns the integration as it was.
  delete(input: { actor: TActorContext; id: string }): Promise<WorkflowIntegration>;
};

export class SlackIntegrationService implements TSlackIntegrationService {
  constructor(
    private readonly transactionRunner: TTransactionRunner<TWorkflowIntegrationsStores>,
    private readonly workflowIntegrationStore: TWorkflowIntegrationStore,
    private readonly orgPermissionService: TOrgPermissionService,
    private readonly kmsDataKeyService: TKmsDataKeyService,
    private readonly instanceConfigService: TInstanceConfigService,
    private readonly slackClient: TSlackClient,
    private readonly config: TSlackIntegrationConfig
  ) {}

  async getInstallUrl({
    actor,
    slug,
    description
  }: {
    actor: TActorContext;
    slug: string;
    description?: string;
  }): Promise<string> {
    const permission = await this.orgPermissionService.getOrgPermission({ actor });
    permission.assert({ action: OrgPermissionActions.Create, subject: OrgPermissionSubjects.Settings });

    const credentials = await this.credentials();
    return this.slackClient.generateInstallUrl({
      credentials,
      metadata: JSON.stringify({ slug, description, orgId: actor.org.id }),
      redirectUri: this.redirectUri()
    });
  }

  async getReinstallUrl({ actor, id }: { actor: TActorContext; id: string }): Promise<string> {
    const integration = await this.findSlack(id, `Slack integration with ID ${id} not found`);
    await this.assertPermission(actor, integration, OrgPermissionActions.Create);

    const credentials = await this.credentials();
    return this.slackClient.generateInstallUrl({
      credentials,
      metadata: JSON.stringify({ id, orgId: integration.orgId }),
      redirectUri: this.redirectUri()
    });
  }

  async handleOAuthCallback({ request, response, onSuccess, onFailure }: THandleSlackOAuthCallbackInput) {
    const credentials = await this.credentials();
    await this.slackClient.handleOAuthCallback({
      credentials,
      request,
      response,
      onInstall: (install) => this.storeInstall(install),
      onSuccess: (metadata) => onSuccess(parseMetadata(metadata)?.orgId),
      onFailure
    });
  }

  async list({ actor }: { actor: TActorContext }): Promise<WorkflowIntegration[]> {
    const permission = await this.orgPermissionService.getOrgPermission({ actor });
    permission.assert({ action: OrgPermissionActions.Create, subject: OrgPermissionSubjects.Settings });
    return this.workflowIntegrationStore.listByOrg(actor.org.id, { provider: WorkflowIntegrationProvider.Slack });
  }

  async getById({ actor, id }: { actor: TActorContext; id: string }): Promise<WorkflowIntegration> {
    const integration = await this.findSlack(id, "Slack integration not found.");
    await this.assertPermission(actor, integration, OrgPermissionActions.Read);
    return integration;
  }

  async assertCanRead({ actor, id }: { actor: TActorContext; id: string }): Promise<WorkflowIntegration> {
    const integration = await this.findSlack(id, `Slack integration with ID ${id} not found`);
    await this.assertPermission(actor, integration, OrgPermissionActions.Read);
    return integration;
  }

  async listChannels({ actor, id }: { actor: TActorContext; id: string }): Promise<TSlackChannel[]> {
    const integration = await this.assertCanRead({ actor, id });
    const { decryptor } = await this.kmsDataKeyService.createCipherPairWithDataKey({
      orgId: integration.orgId,
      type: KmsDataKey.Organization
    });
    const botToken = decryptor({ cipherTextBlob: integration.slackInstallation().encryptedBotAccessToken });
    return this.slackClient.listChannels(botToken.toString("utf8"));
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
    const integration = await this.findSlack(id, `Slack integration with ID ${id} not found`);
    await this.assertPermission(actor, integration, OrgPermissionActions.Edit);

    return this.transactionRunner.run(async ({ stores }) => {
      const current = await stores.workflowIntegrationStore.findByIdForUpdate(id);
      if (!current) throw new EntityNotFoundError({ message: `Slack integration with ID ${id} not found` });
      current.rename({ slug, description });
      await stores.workflowIntegrationStore.save(current);
      return current;
    });
  }

  async delete({ actor, id }: { actor: TActorContext; id: string }): Promise<WorkflowIntegration> {
    const integration = await this.findSlack(id, `Slack integration with ID ${id} not found`);
    await this.assertPermission(actor, integration, OrgPermissionActions.Delete);

    await this.transactionRunner.run(({ stores }) => stores.workflowIntegrationStore.delete(id));
    return integration;
  }

  private async storeInstall(install: TSlackOAuthInstall): Promise<void> {
    if (install.isEnterpriseInstall) {
      throw new RuleViolationError({ message: "Enterprise not yet supported" });
    }
    const metadata = parseMetadata(install.metadata);
    if (!metadata) throw new RuleViolationError({ message: "The Slack install did not come from Infisical" });

    const { encryptor } = await this.kmsDataKeyService.createCipherPairWithDataKey({
      orgId: metadata.orgId,
      type: KmsDataKey.Organization
    });
    const installation = SlackInstallation.restore({
      teamId: install.teamId,
      teamName: install.teamName,
      slackUserId: install.slackUserId,
      slackAppId: install.slackAppId,
      slackBotId: install.slackBotId,
      slackBotUserId: install.slackBotUserId,
      encryptedBotAccessToken: encryptor({ plainText: Buffer.from(install.botAccessToken, "utf8") }).cipherTextBlob
    });

    const reinstallId = metadata.id;
    if (reinstallId) {
      await this.transactionRunner.run(async ({ stores }) => {
        const current = await stores.workflowIntegrationStore.findByIdForUpdate(reinstallId);
        if (!current || current.orgId !== metadata.orgId || !current.isProvider(WorkflowIntegrationProvider.Slack)) {
          throw new EntityNotFoundError({ message: `Slack integration with ID ${reinstallId} not found` });
        }
        current.reinstallSlack(installation);
        await stores.workflowIntegrationStore.save(current);
      });
      return;
    }

    const integration = WorkflowIntegration.createSlack({
      orgId: metadata.orgId,
      slug: metadata.slug,
      description: metadata.description,
      installation
    });
    await this.transactionRunner.run(({ stores }) => stores.workflowIntegrationStore.create(integration));
  }

  private async credentials(): Promise<TSlackAppCredentials> {
    const { clientId, clientSecret } = await this.instanceConfigService.getSlackCredentials();
    if (!clientId || !clientSecret) {
      throw new RuleViolationError({
        message: `Invalid Slack configuration. ${
          this.config.isCloud
            ? "Please contact the Infisical team."
            : "Contact your instance admin to setup Slack integration in the Admin settings. Your configuration is missing Slack client ID and secret."
        }`
      });
    }
    return { clientId, clientSecret };
  }

  private redirectUri(): string {
    return `${this.config.siteUrl}/api/v1/workflow-integrations/slack/oauth_redirect`;
  }

  // Only Slack integrations count: a Teams id reads as missing.
  private async findSlack(id: string, notFoundMessage: string): Promise<WorkflowIntegration> {
    const integration = await this.workflowIntegrationStore.findById(id);
    if (!integration || !integration.isProvider(WorkflowIntegrationProvider.Slack)) {
      throw new EntityNotFoundError({ message: notFoundMessage });
    }
    return integration;
  }

  private async assertPermission(actor: TActorContext, integration: WorkflowIntegration, action: OrgPermissionActions) {
    const permission = await this.orgPermissionService.getOrgPermission({ actor, orgId: integration.orgId });
    permission.assert({ action, subject: OrgPermissionSubjects.Settings });
  }
}
