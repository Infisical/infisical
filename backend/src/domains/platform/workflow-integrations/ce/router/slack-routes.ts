import { z } from "zod";

import { SlackIntegrationsSchema, WorkflowIntegrationsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AuthMode } from "@app/lib/auth/actor-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";

import { toSlackIntegrationResponse } from "./responses";
import { TWorkflowIntegrationsRouterDeps } from "./types";

export const sanitizedSlackIntegrationSchema = WorkflowIntegrationsSchema.pick({
  id: true,
  description: true,
  slug: true,
  integration: true
}).merge(
  SlackIntegrationsSchema.pick({
    teamName: true
  })
);

export const registerSlackRoutes = async (
  server: FastifyZodProvider,
  { slackIntegrationService, siteUrl }: Pick<TWorkflowIntegrationsRouterDeps, "slackIntegrationService" | "siteUrl">
) => {
  server.route({
    method: "GET",
    url: "/install",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getSlackInstallUrl",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        slug: slugSchema({ max: 64 }),
        description: z.string().max(255).optional()
      }),
      response: {
        200: z.string()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const url = await slackIntegrationService.getInstallUrl({
        actor: req.actor,
        ...req.query
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.actor.orgId,
        event: {
          type: EventType.ATTEMPT_CREATE_SLACK_INTEGRATION,
          metadata: {
            slug: req.query.slug,
            description: req.query.description
          }
        }
      });

      return url;
    }
  });

  server.route({
    method: "GET",
    url: "/reinstall",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getSlackReinstallUrl",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: z.string()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const url = await slackIntegrationService.getReinstallUrl({
        actor: req.actor,
        id: req.query.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.actor.orgId,
        event: {
          type: EventType.ATTEMPT_REINSTALL_SLACK_INTEGRATION,
          metadata: {
            id: req.query.id
          }
        }
      });

      return url;
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listSlackIntegrations",
      security: [
        {
          bearerAuth: []
        }
      ],
      response: {
        200: sanitizedSlackIntegrationSchema.array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const slackIntegrations = await slackIntegrationService.list({
        actor: req.actor
      });

      return slackIntegrations.map(toSlackIntegrationResponse);
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deleteSlackIntegration",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: sanitizedSlackIntegrationSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const deletedSlackIntegration = await slackIntegrationService.delete({
        actor: req.actor,
        id: req.params.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: deletedSlackIntegration.orgId,
        event: {
          type: EventType.DELETE_SLACK_INTEGRATION,
          metadata: {
            id: deletedSlackIntegration.id
          }
        }
      });

      return toSlackIntegrationResponse(deletedSlackIntegration);
    }
  });

  server.route({
    method: "GET",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getSlackIntegration",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: sanitizedSlackIntegrationSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const slackIntegration = await slackIntegrationService.getById({
        actor: req.actor,
        id: req.params.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: slackIntegration.orgId,
        event: {
          type: EventType.GET_SLACK_INTEGRATION,
          metadata: {
            id: slackIntegration.id
          }
        }
      });

      return toSlackIntegrationResponse(slackIntegration);
    }
  });

  server.route({
    method: "GET",
    url: "/:id/channels",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listSlackIntegrationChannels",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            name: z.string(),
            id: z.string(),
            isArchived: z.boolean()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const slackChannels = await slackIntegrationService.listChannels({
        actor: req.actor,
        id: req.params.id
      });

      return slackChannels;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "updateSlackIntegration",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        id: z.string().uuid()
      }),
      body: z.object({
        slug: slugSchema({ max: 64 }).optional(),
        description: z.string().max(255).optional()
      }),
      response: {
        200: sanitizedSlackIntegrationSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const slackIntegration = await slackIntegrationService.update({
        actor: req.actor,
        id: req.params.id,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: slackIntegration.orgId,
        event: {
          type: EventType.UPDATE_SLACK_INTEGRATION,
          metadata: {
            id: slackIntegration.id,
            slug: slackIntegration.slug,
            description: slackIntegration.description as string
          }
        }
      });

      return toSlackIntegrationResponse(slackIntegration);
    }
  });

  server.route({
    method: "GET",
    url: "/oauth_redirect",
    config: {
      rateLimit: readLimit
    },
    handler: async (req, res) => {
      await slackIntegrationService.handleOAuthCallback({
        request: req.raw,
        response: res.raw,
        onFailure: async () => {
          await res.redirect(siteUrl as string);
        },
        // Fall back to the site root (like the failure path) if orgId is missing, rather than
        // redirecting to a broken /organizations/undefined/settings page.
        onSuccess: async (orgId) => {
          await res.redirect(
            orgId ? `${siteUrl}/organizations/${orgId}/settings?selectedTab=workflow-integrations` : (siteUrl as string)
          );
        }
      });
    }
  });
};
