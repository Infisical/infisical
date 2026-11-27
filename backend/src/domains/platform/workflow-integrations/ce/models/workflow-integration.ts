import { randomUUID } from "node:crypto";

import { RuleViolationError } from "@app/domains/lib/errors";

import { WorkflowIntegrationProvider, WorkflowIntegrationStatus } from "./enums";
import { MicrosoftTeamsInstallation, TMicrosoftTeamsInstallationRecord } from "./microsoft-teams-installation";
import { SlackInstallation, TSlackInstallationRecord } from "./slack-installation";

export type TWorkflowIntegrationRecord = {
  id: string;
  orgId: string;
  slug: string;
  description: string | null;
  status: WorkflowIntegrationStatus;
} & (
  | { provider: WorkflowIntegrationProvider.Slack; slack: TSlackInstallationRecord }
  | { provider: WorkflowIntegrationProvider.MicrosoftTeams; microsoftTeams: TMicrosoftTeamsInstallationRecord }
);

const PROVIDER_NAMES: Record<WorkflowIntegrationProvider, string> = {
  [WorkflowIntegrationProvider.Slack]: "Slack",
  [WorkflowIntegrationProvider.MicrosoftTeams]: "Microsoft Teams"
};

type TInstallation = SlackInstallation | MicrosoftTeamsInstallation;

// An org's install of a chat app. Stored across workflow_integrations and the provider's own table, which share the id.
export class WorkflowIntegration {
  private constructor(
    readonly id: string,
    readonly orgId: string,
    private currentSlug: string,
    private currentDescription: string | null,
    private currentStatus: WorkflowIntegrationStatus,
    readonly provider: WorkflowIntegrationProvider,
    private installation: TInstallation
  ) {}

  // A Slack install is complete when Slack redirects back, so it starts installed.
  static createSlack(input: {
    orgId: string;
    slug: string;
    description?: string | null;
    installation: SlackInstallation;
  }): WorkflowIntegration {
    return new WorkflowIntegration(
      randomUUID(),
      input.orgId,
      input.slug,
      input.description ?? null,
      WorkflowIntegrationStatus.Installed,
      WorkflowIntegrationProvider.Slack,
      input.installation
    );
  }

  // A Teams integration is installed only once the bot is in the tenant, which an admin may do later.
  static createMicrosoftTeams(input: {
    orgId: string;
    slug: string;
    description?: string | null;
    tenantId: string;
  }): WorkflowIntegration {
    return new WorkflowIntegration(
      randomUUID(),
      input.orgId,
      input.slug,
      input.description ?? null,
      WorkflowIntegrationStatus.Pending,
      WorkflowIntegrationProvider.MicrosoftTeams,
      MicrosoftTeamsInstallation.forTenant(input.tenantId)
    );
  }

  static restore(record: TWorkflowIntegrationRecord): WorkflowIntegration {
    const installation =
      record.provider === WorkflowIntegrationProvider.Slack
        ? SlackInstallation.restore(record.slack)
        : MicrosoftTeamsInstallation.restore(record.microsoftTeams);
    return new WorkflowIntegration(
      record.id,
      record.orgId,
      record.slug,
      record.description,
      record.status,
      record.provider,
      installation
    );
  }

  get slug(): string {
    return this.currentSlug;
  }

  get description(): string | null {
    return this.currentDescription;
  }

  get status(): WorkflowIntegrationStatus {
    return this.currentStatus;
  }

  // Undefined leaves a field as it is.
  rename({ slug, description }: { slug?: string; description?: string }): void {
    if (slug !== undefined) this.currentSlug = slug;
    if (description !== undefined) this.currentDescription = description;
  }

  isInstalled(): boolean {
    return this.currentStatus === WorkflowIntegrationStatus.Installed;
  }

  markInstalled(): void {
    this.currentStatus = WorkflowIntegrationStatus.Installed;
  }

  markPending(): void {
    this.currentStatus = WorkflowIntegrationStatus.Pending;
  }

  isProvider(provider: WorkflowIntegrationProvider): boolean {
    return this.provider === provider;
  }

  assertProvider(provider: WorkflowIntegrationProvider): void {
    if (this.provider !== provider) {
      throw new RuleViolationError({
        message: `Workflow integration with ID '${this.id}' is a ${PROVIDER_NAMES[this.provider]} integration, not a ${PROVIDER_NAMES[provider]} integration`
      });
    }
  }

  slackInstallation(): SlackInstallation {
    this.assertProvider(WorkflowIntegrationProvider.Slack);
    return this.installation as SlackInstallation;
  }

  microsoftTeamsInstallation(): MicrosoftTeamsInstallation {
    this.assertProvider(WorkflowIntegrationProvider.MicrosoftTeams);
    return this.installation as MicrosoftTeamsInstallation;
  }

  reinstallSlack(installation: SlackInstallation): void {
    this.assertProvider(WorkflowIntegrationProvider.Slack);
    this.installation = installation;
  }

  changeMicrosoftTeamsInstallation(change: (installation: MicrosoftTeamsInstallation) => MicrosoftTeamsInstallation) {
    this.installation = change(this.microsoftTeamsInstallation());
  }

  toJSON(): TWorkflowIntegrationRecord {
    const base = {
      id: this.id,
      orgId: this.orgId,
      slug: this.currentSlug,
      description: this.currentDescription,
      status: this.currentStatus
    };
    if (this.installation instanceof SlackInstallation) {
      return { ...base, provider: WorkflowIntegrationProvider.Slack, slack: this.installation.toJSON() };
    }
    return {
      ...base,
      provider: WorkflowIntegrationProvider.MicrosoftTeams,
      microsoftTeams: this.installation.toJSON()
    };
  }
}
