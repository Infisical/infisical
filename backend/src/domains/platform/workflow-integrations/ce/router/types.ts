import { TMicrosoftTeamsIntegrationService } from "../services/microsoft-teams-integration/service";
import { TSlackIntegrationService } from "../services/slack-integration/service";
import { TWorkflowIntegrationService } from "../services/workflow-integration/service";

// What the routes need, handed in where the router is mounted. Routes never read domain services from server.services.
export type TWorkflowIntegrationsRouterDeps = {
  workflowIntegrationService: TWorkflowIntegrationService;
  slackIntegrationService: TSlackIntegrationService;
  microsoftTeamsIntegrationService: TMicrosoftTeamsIntegrationService;
  // Where Slack's OAuth redirect sends the browser back to.
  siteUrl: string | undefined;
};
