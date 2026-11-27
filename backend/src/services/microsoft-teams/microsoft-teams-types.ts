import { TActorInput } from "@app/lib/types";
import { TNotification } from "@app/lib/workflow-integrations/types";

export type TGetMicrosoftTeamsIntegrationByOrgDTO = TActorInput;

export type TGetClientIdDTO = TActorInput;

export type TCreateMicrosoftTeamsIntegrationDTO = TActorInput & {
  tenantId: string;
  slug: string;
  redirectUri: string;
  description?: string;
  code: string;
};

export type TCheckInstallationStatusDTO = { workflowIntegrationId: string } & TActorInput;

export type TGetMicrosoftTeamsIntegrationByIdDTO = { id: string } & TActorInput;

export type TUpdateMicrosoftTeamsIntegrationDTO = { id: string; slug?: string; description?: string } & TActorInput;

export type TGetTeamsDTO = TActorInput & {
  workflowIntegrationId: string;
};

export type TDeleteMicrosoftTeamsIntegrationDTO = {
  id: string;
} & TActorInput;

export type TSendNotificationDTO = {
  tenantId: string;
  microsoftTeamsIntegrationId: string;
  orgId: string;
  target: {
    teamId: string;
    channelIds: string[];
  };
  notification: TNotification;
};
