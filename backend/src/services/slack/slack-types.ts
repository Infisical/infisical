import { TSlackIntegrations } from "@app/db/schemas";
import { TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";
import { TActorInput } from "@app/lib/types";
import { TNotification } from "@app/lib/workflow-integrations/types";

export type TGetSlackInstallUrlDTO = {
  slug: string;
  description?: string;
} & TActorInput;

export type TGetReinstallUrlDTO = {
  id: string;
} & TActorInput;

export type TGetSlackIntegrationByOrgDTO = TActorInput;

export type TGetSlackIntegrationByIdDTO = { id: string } & TActorInput;

export type TGetSlackIntegrationChannelsDTO = { id: string } & TActorInput;

export type TUpdateSlackIntegrationDTO = { id: string; slug?: string; description?: string } & TActorInput;

export type TDeleteSlackIntegrationDTO = {
  id: string;
} & TActorInput;

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
  kmsCoreDomain: TKmsCoreDomain;
  targetChannelIds: string[];
  slackIntegration: TSlackIntegrations;
};
