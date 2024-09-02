import { TProjectPermission } from "@app/lib/types";

export type TGetSlackInstallUrlDTO = TProjectPermission;

export type TGetSlackIntegrationByProjectId = TProjectPermission;

export type TUpdateSlackIntegration = {
  id: string;
  isAccessRequestNotificationEnabled?: boolean;
  accessRequestChannels?: string;
  isSecretRequestNotificationEnabled?: boolean;
  secretRequestChannels?: string;
} & Omit<TProjectPermission, "projectId">;

export type TCompleteSlackIntegrationDTO = {
  projectId: string;
  teamId: string;
  teamName: string;
  slackUserId: string;
  slackAppId: string;
  botAccessToken: string;
  slackBotId: string;
  slackBotUserId: string;
};

export enum SlackTriggerFeature {
  SECRET_APPROVAL = "secret-approval",
  ACCESS_REQUEST = "access-request"
}
