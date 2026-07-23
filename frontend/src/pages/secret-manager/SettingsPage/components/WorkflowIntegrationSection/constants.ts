import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

export const WORKFLOW_INTEGRATION_PLATFORM_LABELS: Record<WorkflowIntegrationPlatform, string> = {
  [WorkflowIntegrationPlatform.SLACK]: "Slack",
  [WorkflowIntegrationPlatform.MICROSOFT_TEAMS]: "Microsoft Teams"
};
