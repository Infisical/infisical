import { TActorContext } from "@app/domains/lib/actor-context";
import { EntityNotFoundError, PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import { TTransactionRunner } from "@app/domains/lib/transactions";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  TProjectPermissionService,
  TProjectsService
} from "@app/domains/platform/projects/ce/module";
import {
  TWorkflowIntegrationService,
  WorkflowIntegration,
  WorkflowIntegrationProvider
} from "@app/domains/platform/workflow-integrations/ce/module";

import {
  MicrosoftTeamsProjectChatConfig,
  TMicrosoftTeamsProjectChatConfigSettings
} from "../../models/microsoft-teams-project-chat-config";
import { SlackProjectChatConfig, TSlackProjectChatConfigSettings } from "../../models/slack-project-chat-config";
import { TMicrosoftTeamsProjectChatConfigStore, TSecretsStores, TSlackProjectChatConfigStore } from "../dependencies";

export type TSlackProjectChatConfigResult = {
  provider: WorkflowIntegrationProvider.Slack;
  config: SlackProjectChatConfig;
};

export type TMicrosoftTeamsProjectChatConfigResult = {
  provider: WorkflowIntegrationProvider.MicrosoftTeams;
  config: MicrosoftTeamsProjectChatConfig;
};

export type TProjectChatConfig = TSlackProjectChatConfigResult | TMicrosoftTeamsProjectChatConfigResult;

type TProjectChatConfigOf<P extends WorkflowIntegrationProvider> = Extract<TProjectChatConfig, { provider: P }>;

type TProjectInput = { actor: TActorContext; projectId: string };

type TUpdateSlackInput = TProjectInput & {
  provider: WorkflowIntegrationProvider.Slack;
  settings: TSlackProjectChatConfigSettings;
};

type TUpdateMicrosoftTeamsInput = TProjectInput & {
  provider: WorkflowIntegrationProvider.MicrosoftTeams;
  settings: TMicrosoftTeamsProjectChatConfigSettings;
};

export type TUpdateProjectChatConfigInput = TUpdateSlackInput | TUpdateMicrosoftTeamsInput;

export type TProjectChatConfigService = {
  // The project's chat settings for one provider. Needs Settings read on the project.
  get<P extends WorkflowIntegrationProvider>(input: TProjectInput & { provider: P }): Promise<TProjectChatConfigOf<P>>;
  // Points the project at an integration of its org and replaces its channels and flags; the first save creates the
  // settings. Needs Settings edit on the project.
  update(input: TUpdateSlackInput): Promise<TSlackProjectChatConfigResult>;
  update(input: TUpdateMicrosoftTeamsInput): Promise<TMicrosoftTeamsProjectChatConfigResult>;
  // Refuses as not found when the project has no settings for that integration. Needs Settings delete on the project.
  delete<P extends WorkflowIntegrationProvider>(
    input: TProjectInput & { provider: P; integrationId: string }
  ): Promise<TProjectChatConfigOf<P>>;
};

// An integration found for an update: whether it belongs to the actor's org and to the project's org.
type TLocatedIntegration = { integration: WorkflowIntegration; inSameOrg: boolean };

export class ProjectChatConfigService implements TProjectChatConfigService {
  constructor(
    private readonly transactionRunner: TTransactionRunner<TSecretsStores>,
    private readonly slackProjectChatConfigStore: TSlackProjectChatConfigStore,
    private readonly microsoftTeamsProjectChatConfigStore: TMicrosoftTeamsProjectChatConfigStore,
    private readonly projectPermissionService: TProjectPermissionService,
    private readonly projectsService: TProjectsService,
    private readonly workflowIntegrationService: TWorkflowIntegrationService
  ) {}

  async get<P extends WorkflowIntegrationProvider>({
    actor,
    projectId,
    provider
  }: TProjectInput & { provider: P }): Promise<TProjectChatConfigOf<P>> {
    await this.assertSettingsAccess(actor, projectId, ProjectPermissionActions.Read);

    const result: TProjectChatConfig | null =
      provider === WorkflowIntegrationProvider.Slack
        ? await this.slackProjectChatConfigStore
            .findByProjectId(projectId)
            .then((config) => (config ? { provider: WorkflowIntegrationProvider.Slack as const, config } : null))
        : await this.microsoftTeamsProjectChatConfigStore
            .findByProjectId(projectId)
            .then((config) =>
              config ? { provider: WorkflowIntegrationProvider.MicrosoftTeams as const, config } : null
            );
    if (!result) {
      throw new EntityNotFoundError({
        message: `Workflow integration config for project '${projectId}' and integration '${provider}' not found`
      });
    }
    return result as TProjectChatConfigOf<P>;
  }

  async update(input: TUpdateSlackInput): Promise<TSlackProjectChatConfigResult>;

  async update(input: TUpdateMicrosoftTeamsInput): Promise<TMicrosoftTeamsProjectChatConfigResult>;

  async update(input: TUpdateProjectChatConfigInput): Promise<TProjectChatConfig> {
    const { actor, projectId } = input;
    const project = await this.projectsService.findProject(projectId);
    if (!project) throw new EntityNotFoundError({ message: `Project with ID '${projectId}' not found` });
    await this.assertSettingsAccess(actor, projectId, ProjectPermissionActions.Edit);

    if (input.provider === WorkflowIntegrationProvider.Slack) {
      const { settings } = input;
      const candidate = SlackProjectChatConfig.create({ projectId, ...settings });
      const located = await this.locate(actor, project.orgId, input.provider, settings.integrationId);
      if (!located) {
        throw new EntityNotFoundError({ message: `Slack integration with ID '${settings.integrationId}' not found` });
      }
      if (!located.inSameOrg) {
        throw new PermissionDeniedError({ message: "Selected slack integration is not in the same organization" });
      }

      const config = await this.transactionRunner.run(async ({ stores }) => {
        const existing = await stores.slackProjectChatConfigStore.findByProjectId(projectId);
        existing?.reconfigure(settings);
        return stores.slackProjectChatConfigStore.upsert(existing ?? candidate);
      });
      return { provider: input.provider, config };
    }

    const { settings } = input;
    const candidate = MicrosoftTeamsProjectChatConfig.create({ projectId, ...settings });
    const located = await this.locate(actor, project.orgId, input.provider, settings.integrationId);
    if (!located) {
      throw new EntityNotFoundError({
        message: `Microsoft Teams integration with ID '${settings.integrationId}' not found`
      });
    }
    if (!located.integration.isInstalled()) {
      throw new RuleViolationError({
        message: "Microsoft Teams integration is not properly installed in your tenant."
      });
    }
    if (!located.inSameOrg) {
      throw new PermissionDeniedError({
        message: "Selected Microsoft Teams integration is not in the same organization"
      });
    }

    const config = await this.transactionRunner.run(async ({ stores }) => {
      const existing = await stores.microsoftTeamsProjectChatConfigStore.findByProjectId(projectId);
      existing?.reconfigure(settings);
      return stores.microsoftTeamsProjectChatConfigStore.upsert(existing ?? candidate);
    });
    return { provider: input.provider, config };
  }

  async delete<P extends WorkflowIntegrationProvider>({
    actor,
    projectId,
    provider,
    integrationId
  }: TProjectInput & { provider: P; integrationId: string }): Promise<TProjectChatConfigOf<P>> {
    await this.assertSettingsAccess(actor, projectId, ProjectPermissionActions.Delete);

    const result: TProjectChatConfig | null =
      provider === WorkflowIntegrationProvider.Slack
        ? await this.slackProjectChatConfigStore
            .deleteByProjectAndIntegration(projectId, integrationId)
            .then((config) => (config ? { provider: WorkflowIntegrationProvider.Slack as const, config } : null))
        : await this.microsoftTeamsProjectChatConfigStore
            .deleteByProjectAndIntegration(projectId, integrationId)
            .then((config) =>
              config ? { provider: WorkflowIntegrationProvider.MicrosoftTeams as const, config } : null
            );
    if (!result) {
      throw new EntityNotFoundError({
        message: `Workflow integration config for project '${projectId}' and integration '${provider}' with ID '${integrationId}' not found`
      });
    }
    return result as TProjectChatConfigOf<P>;
  }

  private async assertSettingsAccess(actor: TActorContext, projectId: string, action: ProjectPermissionActions) {
    const permission = await this.projectPermissionService.getProjectPermission({ actor, projectId });
    permission.assert({ action, subject: ProjectPermissionSub.Settings });
  }

  // As the project routes always answered: a missing id is not found, and an integration outside the actor's or the
  // project's org is refused as "not in the same organization".
  private async locate(
    actor: TActorContext,
    projectOrgId: string,
    provider: WorkflowIntegrationProvider,
    id: string
  ): Promise<TLocatedIntegration | null> {
    const integration = await this.workflowIntegrationService.findById({ id, provider });
    if (!integration) return null;
    return { integration, inSameOrg: integration.orgId === actor.org.id && integration.orgId === projectOrgId };
  }
}
