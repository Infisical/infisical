export type ProjectSlackIntegration = {
  id: string;
  teamName: string;
  isAccessRequestNotificationEnabled: boolean;
  accessRequestChannels: string;
  isSecretRequestNotificationEnabled: boolean;
  secretRequestChannels: string;
};

export type TUpdateSlackIntegrationDTO = {
  id: string;
  workspaceId: string;
  isAccessRequestNotificationEnabled?: boolean;
  accessRequestChannels?: string;
  isSecretRequestNotificationEnabled?: boolean;
  secretRequestChannels?: string;
};
