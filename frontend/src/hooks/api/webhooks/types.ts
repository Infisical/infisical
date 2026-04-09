export enum WebhookType {
  GENERAL = "general",
  SLACK = "slack",
  MICROSOFT_TEAMS = "microsoft-teams"
}

export enum WebhookEvent {
  SecretModified = "secrets.modified",
  SecretRotationFailed = "secrets.rotation-failed"
}

export type TWebhookEventToggleKey = Exclude<
  keyof TUpdateWebhookDto,
  "webhookId" | "projectId" | "isDisabled"
>;

export type TWebhookEventMetadata = {
  key: TWebhookEventToggleKey;
  label: string;
  description: string;
};

export const WEBHOOK_EVENTS = Object.values(WebhookEvent) as WebhookEvent[];

export const WEBHOOK_EVENT_METADATA: Record<WebhookEvent, TWebhookEventMetadata> = {
  [WebhookEvent.SecretRotationFailed]: {
    key: "isSecretRotationFailedEventEnabled",
    label: "Secret Rotation Failed",
    description: "Triggered when a secret rotation fails"
  },
  [WebhookEvent.SecretModified]: {
    key: "isSecretModifiedEventEnabled",
    label: "Secret Modified",
    description: "Triggered when secrets are modified"
  }
};

export type TWebhook = {
  id: string;
  type: WebhookType;
  projectId: string;
  environment: {
    slug: string;
    name: string;
    id: string;
  };
  envId: string;
  secretPath: string;
  url: string;
  lastStatus: "success" | "failed";
  lastRunErrorMessage?: string;
  isDisabled: boolean;
  isSecretModifiedEventEnabled: boolean;
  isSecretRotationFailedEventEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TCreateWebhookDto = {
  projectId: string;
  environment: string;
  webhookUrl: string;
  webhookSecretKey?: string;
  secretPath: string;
  type: WebhookType;
};

export type TUpdateWebhookDto = {
  webhookId: string;
  projectId: string;
  isDisabled?: boolean;
  isSecretModifiedEventEnabled?: boolean;
  isSecretRotationFailedEventEnabled?: boolean;
};

export type TDeleteWebhookDto = {
  webhookId: string;
  projectId: string;
};

export type TTestWebhookDTO = {
  webhookId: string;
  projectId: string;
};
