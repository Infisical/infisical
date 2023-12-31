export type TWebhook = {
  id: string;
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
  createdAt: string;
  updatedAt: string;
};

export type TCreateWebhookDto = {
  workspaceId: string;
  environment: string;
  webhookUrl: string;
  webhookSecretKey?: string;
  secretPath: string;
};

export type TUpdateWebhookDto = {
  webhookId: string;
  workspaceId: string;
  isDisabled?: boolean;
};

export type TDeleteWebhookDto = {
  webhookId: string;
  workspaceId: string;
};

export type TTestWebhookDTO = {
  webhookId: string;
  workspaceId: string;
};
