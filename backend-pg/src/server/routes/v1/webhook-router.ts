import { z } from "zod";

import { WebhooksSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const sanitizedWebhookSchema = WebhooksSchema.omit({
  encryptedSecretKey: true,
  iv: true,
  tag: true,
  algorithm: true,
  keyEncoding: true,
}).merge(
  z.object({
    projectId:z.string(),
    environment: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string()
    })
  })
);

export const registerWebhookRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        webhookUrl: z.string().url().trim(),
        webhookSecretKey: z.string().trim().optional(),
        secretPath: z.string().trim().default("/")
      }),
      response: {
        200: z.object({
          message: z.string(),
          webhook: sanitizedWebhookSchema
        })
      }
    },
    handler: async (req) => {
      const webhook = await server.services.webhook.createWebhook({
        actor: req.permission.type,
        actorId: req.permission.id,
        projectId: req.body.workspaceId,
        ...req.body
      });
      return { message: "Successfully created webhook", webhook };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:webhookId",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        webhookId: z.string().trim()
      }),
      body: z.object({
        isDisabled: z.boolean().default(false)
      }),
      response: {
        200: z.object({
          message: z.string(),
          webhook: sanitizedWebhookSchema
        })
      }
    },
    handler: async (req) => {
      const webhook = await server.services.webhook.updateWebhook({
        actor: req.permission.type,
        actorId: req.permission.id,
        id: req.params.webhookId,
        isDisabled: req.body.isDisabled
      });
      return { message: "Successfully updated webhook", webhook };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:webhookId",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        webhookId: z.string().trim()
      })
    },
    handler: async (req) => {
      const webhook = await server.services.webhook.deleteWebhook({
        actor: req.permission.type,
        actorId: req.permission.id,
        id: req.params.webhookId
      });
      return { message: "Successfully deleted webhook", webhook };
    }
  });

  server.route({
    method: "POST",
    url: "/:webhookId/test",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        webhookId: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string(),
          webhook: sanitizedWebhookSchema
        })
      }
    },
    handler: async (req) => {
      const webhook = await server.services.webhook.testWebhook({
        actor: req.permission.type,
        actorId: req.permission.id,
        id: req.params.webhookId
      });
      return { message: "Successfully tested webhook", webhook };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      querystring: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim().optional(),
        secretPath: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          message: z.string(),
          webhooks: sanitizedWebhookSchema.array()
        })
      }
    },
    handler: async (req) => {
      const webhooks = await server.services.webhook.listWebhooks({
        actor: req.permission.type,
        actorId: req.permission.id,
        ...req.query,
        projectId: req.query.workspaceId
      });
      return { message: "Successfully fetched webhook", webhooks };
    }
  });
};
