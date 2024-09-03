import { TOrgPermission } from "@app/lib/types";

export type TGetSlackInstallUrlDTO = {
  slug: string;
  description?: string;
} & Omit<TOrgPermission, "orgId">;

export type TGetSlackIntegrationByOrgDTO = Omit<TOrgPermission, "orgId">;

export type TGetSlackIntegrationByIdDTO = { id: string } & Omit<TOrgPermission, "orgId">;

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

export enum SlackTriggerFeature {
  SECRET_APPROVAL = "secret-approval",
  ACCESS_REQUEST = "access-request"
}
