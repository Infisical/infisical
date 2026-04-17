export enum WebhookType {
  GENERAL = "general",
  SLACK = "slack",
  MICROSOFT_TEAMS = "microsoft-teams"
}

export enum WebhookEvent {
  SecretModified = "secrets.modified",
  SecretRotationFailed = "secrets.rotation-failed"
}

export type TWebhookEventMetadata = {
  label: string;
  description: string;
};

export const WEBHOOK_EVENTS = Object.values(WebhookEvent) as WebhookEvent[];

export const WEBHOOK_EVENT_METADATA: Record<WebhookEvent, TWebhookEventMetadata> = {
  [WebhookEvent.SecretRotationFailed]: {
    label: "Secret Rotation Failed",
    description: "Triggered when a secret rotation fails"
  },
  [WebhookEvent.SecretModified]: {
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
  eventsFilter: { eventName: WebhookEvent }[];
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
  eventsFilter?: { eventName: WebhookEvent }[];
};

export type TUpdateWebhookDto = {
  webhookId: string;
  projectId: string;
  isDisabled?: boolean;
  eventsFilter?: { eventName: WebhookEvent }[];
};

export type TDeleteWebhookDto = {
  webhookId: string;
  projectId: string;
};

export type TTestWebhookDTO = {
  webhookId: string;
  projectId: string;
};
