import { TSlackIntegrations } from "@app/db/schemas/slack-integrations";
import { TOrgPermission } from "@app/lib/types";
import { TNotification } from "@app/lib/workflow-integrations/types";

import { TKmsServiceFactory } from "../kms/kms-service";

export type TGetSlackInstallUrlDTO = {
  slug: string;
  description?: string;
} & Omit<TOrgPermission, "orgId">;

export type TGetReinstallUrlDTO = {
  id: string;
} & Omit<TOrgPermission, "orgId">;

export type TGetSlackIntegrationByOrgDTO = Omit<TOrgPermission, "orgId">;

export type TGetSlackIntegrationByIdDTO = { id: string } & Omit<TOrgPermission, "orgId">;

export type TGetSlackIntegrationChannelsDTO = { id: string } & Omit<TOrgPermission, "orgId">;

export type TUpdateSlackIntegrationDTO = { id: string; slug?: string; description?: string } & Omit<
  TOrgPermission,
  "orgId"
>;

export type TDeleteSlackIntegrationDTO = {
  id: string;
} & Omit<TOrgPermission, "orgId">;

export type TCompleteSlackIntegrationDTO = {
  orgId: string;
  slug: string;
  description?: string;
  teamId: string;
  teamName: string;
  slackUserId: string;
  slackAppId: string;
  botAccessToken: string;
  slackBotId: string;
  slackBotUserId: string;
};

export type TReinstallSlackIntegrationDTO = {
  id: string;
  teamId: string;
  teamName: string;
  slackUserId: string;
  slackAppId: string;
  botAccessToken: string;
  slackBotId: string;
  slackBotUserId: string;
};

export type TSendSlackNotificationDTO = {
  orgId: string;
  notification: TNotification;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  targetChannelIds: string[];
  slackIntegration: TSlackIntegrations;
};
