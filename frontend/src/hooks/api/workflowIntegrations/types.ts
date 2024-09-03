export enum WorkflowIntegrationPlatform {
  SLACK = "slack"
}

export type SlackIntegration = {
  id: string;
  slug: string;
  description: string;
  teamName: string;
};

export type TUpdateSlackIntegrationDTO = {
  id: string;
  orgId: string;
  slug?: string;
  description?: string;
};

export type TDeleteSlackIntegrationDTO = {
  id: string;
  orgId: string;
};
