import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

export const PLATFORMS = [
  WorkflowIntegrationPlatform.SLACK,
  WorkflowIntegrationPlatform.MICROSOFT_TEAMS
] as const;

export const PLATFORM_NAMES: Record<WorkflowIntegrationPlatform, string> = {
  [WorkflowIntegrationPlatform.SLACK]: "Slack",
  [WorkflowIntegrationPlatform.MICROSOFT_TEAMS]: "Microsoft Teams"
};

export const PLATFORM_ICONS: Record<WorkflowIntegrationPlatform, string> = {
  [WorkflowIntegrationPlatform.SLACK]: "Slack.svg",
  [WorkflowIntegrationPlatform.MICROSOFT_TEAMS]: "Microsoft Teams.svg"
};
