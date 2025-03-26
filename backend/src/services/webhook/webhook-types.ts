import { TProjectPermission } from "@app/lib/types";

export type TCreateWebhookDTO = {
  environment: string;
  secretPath?: string;
  webhookUrl: string;
  webhookSecretKey?: string;
  type: string;
} & TProjectPermission;

export type TUpdateWebhookDTO = {
  id: string;
  isDisabled?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TTestWebhookDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteWebhookDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TListWebhookDTO = {
  environment?: string;
  secretPath?: string;
} & TProjectPermission;

export enum WebhookType {
  GENERAL = "general",
  SLACK = "slack"
}

export enum WebhookEvents {
  SecretModified = "secrets.modified",
  SecretReminderExpired = "secrets.reminder-expired",
  TestEvent = "test"
}

type TWebhookSecretModifiedEventPayload = {
  type: WebhookEvents.SecretModified;
  payload: {
    projectName?: string;
    projectId: string;
    environment: string;
    secretPath?: string;
    type?: string | null;
  };
};

type TWebhookSecretReminderEventPayload = {
  type: WebhookEvents.SecretReminderExpired;
  payload: {
    projectName?: string;
    projectId: string;
    environment: string;
    secretPath?: string;
    type?: string | null;
    secretName: string;
    secretId: string;
    reminderNote?: string | null;
  };
};

export type TWebhookPayloads = TWebhookSecretModifiedEventPayload | TWebhookSecretReminderEventPayload;
