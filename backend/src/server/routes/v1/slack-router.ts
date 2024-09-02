import { z } from "zod";

import { SlackIntegrationsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { getConfig } from "@app/lib/config/env";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { validateSlackChannelsField } from "@app/services/slack/slack-auth-validators";

export const registerSlackRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();

  server.route({
    method: "GET",
    url: "/install",
    config: {
      rateLimit: readLimit
    },
    schema: {
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        projectId: z.string()
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
        projectId: req.query.projectId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.projectId,
        event: {
          type: EventType.ATTEMPT_CREATE_SLACK_INTEGRATION,
          metadata: {}
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
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: SlackIntegrationsSchema.pick({
          id: true,
          teamName: true,
          isAccessRequestNotificationEnabled: true,
          accessRequestChannels: true,
          isSecretRequestNotificationEnabled: true,
          secretRequestChannels: true
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const slackIntegration = await server.services.slack.getSlackIntegrationByProjectId({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.query.projectId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.projectId,
        event: {
          type: EventType.GET_SLACK_INTEGRATION,
          metadata: {
            id: slackIntegration?.id
          }
        }
      });

      return slackIntegration;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:slackIntegrationId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        slackIntegrationId: z.string()
      }),
      body: z.object({
        isAccessRequestNotificationEnabled: z.boolean().optional(),
        accessRequestChannels: validateSlackChannelsField.optional(),
        isSecretRequestNotificationEnabled: z.boolean().optional(),
        secretRequestChannels: validateSlackChannelsField.optional()
      }),
      response: {
        200: SlackIntegrationsSchema.pick({
          id: true,
          teamName: true,
          isAccessRequestNotificationEnabled: true,
          accessRequestChannels: true,
          isSecretRequestNotificationEnabled: true,
          secretRequestChannels: true
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const updatedSlackIntegration = await server.services.slack.updateSlackIntegration({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.slackIntegrationId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: updatedSlackIntegration.projectId,
        event: {
          type: EventType.UPDATE_SLACK_INTEGRATION,
          metadata: {
            id: updatedSlackIntegration.id,
            isAccessRequestNotificationEnabled: updatedSlackIntegration.isAccessRequestNotificationEnabled,
            accessRequestChannels: updatedSlackIntegration.accessRequestChannels,
            isSecretRequestNotificationEnabled: updatedSlackIntegration.isSecretRequestNotificationEnabled,
            secretRequestChannels: updatedSlackIntegration.secretRequestChannels
          }
        }
      });

      return updatedSlackIntegration;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:slackIntegrationId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        slackIntegrationId: z.string()
      }),
      response: {
        200: SlackIntegrationsSchema.pick({
          id: true,
          teamName: true,
          isAccessRequestNotificationEnabled: true,
          accessRequestChannels: true,
          isSecretRequestNotificationEnabled: true,
          secretRequestChannels: true
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const deletedSlackIntegration = await server.services.slack.deleteSlackIntegration({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.slackIntegrationId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: deletedSlackIntegration.projectId,
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
        successAsync: async (installation) => {
          const metadata = JSON.parse(installation.metadata || "") as {
            projectId: string;
          };

          return res.redirect(`${appCfg.SITE_URL}/project/${metadata.projectId}/settings`);
        }
      });
    }
  });
};
