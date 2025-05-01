export enum WorkflowIntegrationPlatform {
  SLACK = "slack",
  MICROSOFT_TEAMS = "microsoft-teams"
}

export type WorkflowIntegration = {
  id: string;
  slug: string;
  description: string;
  status: WorkflowIntegrationStatus;
  integration: WorkflowIntegrationPlatform;
};

export type MicrosoftTeamsIntegrationTeam = {
  teamId: string;
  teamName: string;
  channels: {
    channelId: string;
    channelName: string;
  }[];
};

export type SlackIntegration = {
  id: string;
  slug: string;
  description: string;
  teamName: string;
};

export enum WorkflowIntegrationStatus {
  Pending = "pending",
  Installed = "installed"
}

export type MicrosoftTeamsIntegration = {
  id: string;
  slug: string;
  description: string;
  tenantId: string;
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

export type TUpdateMicrosoftTeamsIntegrationDTO = {
  id: string;
  orgId: string;
  slug?: string;
  description?: string;
};

export type TCreateMicrosoftTeamsIntegrationDTO = {
  code: string;
  tenantId: string;
  slug: string;
  description?: string;
  redirectUri: string;
  orgId: string;
};

export type TDeleteSlackIntegrationDTO = {
  id: string;
  orgId: string;
};

export type TDeleteMicrosoftTeamsIntegrationDTO = {
  id: string;
  orgId: string;
};

export type ProjectWorkflowIntegrationConfig =
  | {
      id: string;
      integration: WorkflowIntegrationPlatform.SLACK;
      integrationId: string;
      isAccessRequestNotificationEnabled: boolean;
      accessRequestChannels: string;
      isSecretRequestNotificationEnabled: boolean;
      secretRequestChannels: string;
    }
  | {
      id: string;
      integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS;
      integrationId: string;
      isAccessRequestNotificationEnabled: boolean;
      isSecretRequestNotificationEnabled: boolean;
      accessRequestChannels: {
        teamId: string;
        channelIds: string[];
      };
      secretRequestChannels: {
        teamId: string;
        channelIds: string[];
      };
    };

export type TUpdateProjectWorkflowIntegrationConfigDTO =
  | {
      integration: WorkflowIntegrationPlatform.SLACK;
      workspaceId: string;
      integrationId: string;
      isAccessRequestNotificationEnabled: boolean;
      accessRequestChannels: string;
      isSecretRequestNotificationEnabled: boolean;
      secretRequestChannels: string;
    }
  | {
      integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS;
      workspaceId: string;
      integrationId: string;
      isAccessRequestNotificationEnabled: boolean;
      isSecretRequestNotificationEnabled: boolean;
      accessRequestChannels?: {
        teamId: string;
        channelIds: string[];
      };
      secretRequestChannels?: {
        teamId: string;
        channelIds: string[];
      };
    };
export type TDeleteProjectWorkflowIntegrationDTO = {
  projectId: string;
  integration: WorkflowIntegrationPlatform;
  integrationId: string;
};

export type TCheckMicrosoftTeamsIntegrationInstallationStatusDTO = {
  workflowIntegrationId: string;
  orgId: string;
};
