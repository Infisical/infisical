import { TOrgPermission } from "@app/lib/types";
import { TNotification } from "@app/lib/workflow-integrations/types";

export type TGetMicrosoftTeamsIntegrationByOrgDTO = Omit<TOrgPermission, "orgId">;

export type TGetClientIdDTO = Omit<TOrgPermission, "orgId">;

export type TCreateMicrosoftTeamsIntegrationDTO = Omit<TOrgPermission, "orgId"> & {
  tenantId: string;
  slug: string;
  redirectUri: string;
  description?: string;
  code: string;
};

export type TCheckInstallationStatusDTO = { workflowIntegrationId: string } & Omit<TOrgPermission, "orgId">;

export type TGetMicrosoftTeamsIntegrationByIdDTO = { id: string } & Omit<TOrgPermission, "orgId">;

export type TUpdateMicrosoftTeamsIntegrationDTO = { id: string; slug?: string; description?: string } & Omit<
  TOrgPermission,
  "orgId"
>;

export type TGetTeamsDTO = Omit<TOrgPermission, "orgId"> & {
  workflowIntegrationId: string;
};

export type TDeleteMicrosoftTeamsIntegrationDTO = {
  id: string;
} & Omit<TOrgPermission, "orgId">;

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
