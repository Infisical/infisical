import { TProjectPermission } from "@app/lib/types";

import { ActorType } from "../auth/auth-type";

export type TCreateWebhookDTO = {
  environment: string;
  secretPath?: string;
  webhookUrl: string;
  webhookSecretKey?: string;
  type: string;
  eventsFilter?: { eventName: TSubscribableWebhookEvent }[];
} & TProjectPermission;

export type TUpdateWebhookDTO = {
  id: string;
  isDisabled?: boolean;
  eventsFilter?: { eventName: TSubscribableWebhookEvent }[];
} & Omit<TProjectPermission, "projectId">;

export type TTestWebhookDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteWebhookDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetWebhookByIdDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TListWebhookDTO = {
  environment?: string;
  secretPath?: string;
} & TProjectPermission;

export enum WebhookType {
  GENERAL = "general",
  SLACK = "slack",
  MICROSOFT_TEAMS = "microsoft-teams"
}

export enum WebhookEvents {
  SecretModified = "secrets.modified",
  SecretRotationFailed = "secrets.rotation-failed",
  HoneyTokenTriggered = "honey-token.triggered",
  TestEvent = "test"
}

export const SUBSCRIBABLE_WEBHOOK_EVENTS = [
  WebhookEvents.SecretModified,
  WebhookEvents.SecretRotationFailed,
  WebhookEvents.HoneyTokenTriggered
] as const;

export type TSubscribableWebhookEvent = (typeof SUBSCRIBABLE_WEBHOOK_EVENTS)[number];

type TWebhookSecretModifiedEventPayload = {
  type: WebhookEvents.SecretModified;
  payload: {
    projectName?: string;
    projectId: string;
    environment: string;
    environmentName: string;
    secretPath?: string;
    type?: string | null;
    changedBy?: string;
    changedByActorType?: ActorType;
  };
};

type TWebhookSecretRotationFailedEventPayload = {
  type: WebhookEvents.SecretRotationFailed;

  payload: {
    rotationName?: string;
    projectName?: string;
    projectId: string;
    environment: string;
    environmentName: string;
    secretPath?: string;
    triggeredManually?: boolean;
    errorMessage?: string;
    type?: string | null;
  };
};

type TWebhookHoneyTokenTriggeredEventPayload = {
  type: WebhookEvents.HoneyTokenTriggered;
  payload: {
    honeyTokenName: string;
    projectName?: string;
    projectId: string;
    environment: string;
    environmentName: string;
    secretPath?: string;
    type?: string | null;
    eventName: string;
    sourceIp?: string;
    awsRegion: string;
  };
};

type TWebhookTestEventPayload = {
  type: WebhookEvents.TestEvent;
  payload: {
    projectName?: string;
    projectId: string;
    environment: string;
    environmentName: string;
    secretPath?: string;
    type?: string | null;
  };
};

export type TWebhookPayloads =
  | TWebhookSecretModifiedEventPayload
  | TWebhookSecretRotationFailedEventPayload
  | TWebhookHoneyTokenTriggeredEventPayload
  | TWebhookTestEventPayload;
