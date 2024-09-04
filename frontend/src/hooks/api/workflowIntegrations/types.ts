export enum WorkflowIntegrationPlatform {
  SLACK = "Slack"
}

export type SlackIntegration = {
  id: string;
  slug: string;
  description: string;
  teamName: string;
};

export type SlackIntegrationChannel = {
  id: string;
  name: string;
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

export type ProjectSlackConfig = {
  id: string;
  slackIntegrationId: string;
  isAccessRequestNotificationEnabled: boolean;
  accessRequestChannels: string;
  isSecretRequestNotificationEnabled: boolean;
  secretRequestChannels: string;
};

export type TUpdateProjectSlackConfigDTO = {
  workspaceId: string;
  slackIntegrationId: string;
  isAccessRequestNotificationEnabled: boolean;
  accessRequestChannels: string;
  isSecretRequestNotificationEnabled: boolean;
  secretRequestChannels: string;
};
