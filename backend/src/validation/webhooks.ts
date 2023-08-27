import { z } from "zod";

export const CreateWebhookV1 = z.object({
  body: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    webhookUrl: z.string().url().trim(),
    webhookSecretKey: z.string().trim().optional(),
    secretPath: z.string().trim().default("/")
  })
});

export const UpdateWebhookV1 = z.object({
  params: z.object({
    webhookId: z.string().trim()
  }),
  body: z.object({
    isDisabled: z.boolean().default(false)
  })
});

export const TestWebhookV1 = z.object({
  params: z.object({
    webhookId: z.string().trim()
  })
});

export const DeleteWebhookV1 = z.object({
  params: z.object({
    webhookId: z.string().trim()
  })
});

export const ListWebhooksV1 = z.object({
  query: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim().optional(),
    secretPath: z.string().trim().optional()
  })
});
