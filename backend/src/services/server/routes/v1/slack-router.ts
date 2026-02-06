import { z } from "zod";

import { SlackIntegrationsSchema, WorkflowIntegrationsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { getConfig } from "@app/lib/config/env";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const sanitizedSlackIntegrationSchema = WorkflowIntegrationsSchema.pick({
  id: true,
  description: true,
  slug: true,
  integration: true
}).merge(
  SlackIntegrationsSchema.pick({
    teamName: true
  })
);

export const registerSlackRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();

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
        description: z.string().optional()
      }),
      response: {
        200: z.string()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const url = await server.services.slack.getInstallUrl({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
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
        id: z.string()
      }),
      response: {
        200: z.string()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const url = await server.services.slack.getReinstallUrl({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.query.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const slackIntegrations = await server.services.slack.getSlackIntegrationsByOrg({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return slackIntegrations;
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
        id: z.string()
      }),
      response: {
        200: sanitizedSlackIntegrationSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const deletedSlackIntegration = await server.services.slack.deleteSlackIntegration({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
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

      return deletedSlackIntegration;
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
        id: z.string()
      }),
      response: {
        200: sanitizedSlackIntegrationSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const slackIntegration = await server.services.slack.getSlackIntegrationById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
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

      return slackIntegration;
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
        id: z.string()
      }),
      response: {
        200: z
          .object({
            name: z.string(),
            id: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const slackChannels = await server.services.slack.getSlackIntegrationChannels({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
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
        id: z.string()
      }),
      body: z.object({
        slug: slugSchema({ max: 64 }).optional(),
        description: z.string().optional()
      }),
      response: {
        200: sanitizedSlackIntegrationSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const slackIntegration = await server.services.slack.updateSlackIntegration({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
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

      return slackIntegration;
    }
  });

  server.route({
    method: "GET",
    url: "/oauth_redirect",
    config: {
      rateLimit: readLimit
    },
    handler: async (req, res) => {
      const installer = await server.services.slack.getSlackInstaller();

      return installer.handleCallback(req.raw, res.raw, {
        failureAsync: async () => {
          return res.redirect(appCfg.SITE_URL as string);
        },
        successAsync: async () => {
          return res.redirect(`${appCfg.SITE_URL}/organization/settings?selectedTab=workflow-integrations`);
        }
      });
    }
  });
};
