import { z } from "zod";

import { WebhooksSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { removeTrailingSlash } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { WebhookType } from "@app/services/webhook/webhook-types";

export const sanitizedWebhookSchema = WebhooksSchema.pick({
  id: true,
  secretPath: true,
  lastStatus: true,
  lastRunErrorMessage: true,
  isDisabled: true,
  createdAt: true,
  updatedAt: true,
  envId: true,
  type: true
}).extend({
  projectId: z.string(),
  environment: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string()
  })
});

export const registerWebhookRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z
        .object({
          type: z.nativeEnum(WebhookType).default(WebhookType.GENERAL),
          workspaceId: z.string().trim(),
          environment: z.string().trim(),
          webhookUrl: z.string().url().trim(),
          webhookSecretKey: z.string().trim().optional(),
          secretPath: z.string().trim().default("/").transform(removeTrailingSlash)
        })
        .superRefine((data, ctx) => {
          if (data.type === WebhookType.SLACK && !data.webhookUrl.includes("hooks.slack.com")) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Incoming Webhook URL is invalid.",
              path: ["webhookUrl"]
            });
          }
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.body.workspaceId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.workspaceId,
        event: {
          type: EventType.CREATE_WEBHOOK,
          metadata: {
            environment: webhook.environment.slug,
            webhookId: webhook.id,
            isDisabled: webhook.isDisabled,
            secretPath: webhook.secretPath
          }
        }
      });

      return { message: "Successfully created webhook", webhook };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:webhookId",
    config: {
      rateLimit: writeLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.webhookId,
        isDisabled: req.body.isDisabled
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: webhook.projectId,
        event: {
          type: EventType.UPDATE_WEBHOOK_STATUS,
          metadata: {
            environment: webhook.environment.slug,
            webhookId: webhook.id,
            isDisabled: webhook.isDisabled,
            secretPath: webhook.secretPath
          }
        }
      });

      return { message: "Successfully updated webhook", webhook };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:webhookId",
    config: {
      rateLimit: writeLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.webhookId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: webhook.projectId,
        event: {
          type: EventType.DELETE_WEBHOOK,
          metadata: {
            environment: webhook.environment.slug,
            webhookId: webhook.id,
            isDisabled: webhook.isDisabled,
            secretPath: webhook.secretPath
          }
        }
      });

      return { message: "Successfully deleted webhook", webhook };
    }
  });

  server.route({
    method: "POST",
    url: "/:webhookId/test",
    config: {
      rateLimit: writeLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.webhookId
      });
      return { message: "Successfully tested webhook", webhook };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      querystring: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim().optional(),
        secretPath: z
          .string()
          .trim()
          .optional()
          .transform((val) => (val ? removeTrailingSlash(val) : val))
      }),
      response: {
        200: z.object({
          message: z.string(),
          webhooks: sanitizedWebhookSchema.extend({ url: z.string() }).array()
        })
      }
    },
    handler: async (req) => {
      const webhooks = await server.services.webhook.listWebhooks({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query,
        projectId: req.query.workspaceId
      });
      return { message: "Successfully fetched webhook", webhooks };
    }
  });
};
