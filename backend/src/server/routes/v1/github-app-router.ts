import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { SanitizedGitHubAppSchema } from "@app/services/github-app/github-app-types";

export const registerGitHubAppRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/manifest/initiate",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z
        .object({
          name: z.string().trim().min(1).max(64),
          instanceType: z.enum(["cloud", "server"]).default("cloud"),
          githubOrg: z.string().trim().optional(),
          githubHost: z.string().trim().optional(),
          installState: z.string().trim().min(1),
          projectId: z.string().trim().optional(),
          gatewayId: z.string().uuid().optional(),
          gatewayPoolId: z.string().uuid().optional()
        })
        .refine((data) => !(data.gatewayId && data.gatewayPoolId), {
          message: "Cannot specify both a gateway and a gateway pool",
          path: ["gatewayPoolId"]
        }),
      response: {
        200: z.object({
          state: z.string(),
          manifest: z.record(z.unknown()),
          githubActionUrl: z.string()
        })
      }
    },
    handler: async (req) => {
      const result = await server.services.gitHubApp.initiateManifestCreation({
        orgPermission: req.permission,
        name: req.body.name,
        instanceType: req.body.instanceType,
        githubOrg: req.body.githubOrg,
        githubHost: req.body.githubHost,
        installState: req.body.installState,
        projectId: req.body.projectId,
        gatewayId: req.body.gatewayId,
        gatewayPoolId: req.body.gatewayPoolId
      });

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/manifest/callback",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      querystring: z.object({
        code: z.string().trim().min(1),
        state: z.string().trim().min(1)
      })
    },
    handler: async (req, reply) => {
      const { redirectUrl } = await server.services.gitHubApp.handleManifestCallback({
        code: req.query.code,
        state: req.query.state,
        auditLogInfo: {
          ipAddress: req.auditLogInfo.ipAddress,
          userAgent: req.auditLogInfo.userAgent,
          userAgentType: req.auditLogInfo.userAgentType
        }
      });

      return reply.redirect(redirectUrl);
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      querystring: z.object({
        projectId: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          gitHubApps: SanitizedGitHubAppSchema.array()
        })
      }
    },
    handler: async (req) => {
      const gitHubApps = await server.services.gitHubApp.listGitHubApps({
        orgPermission: req.permission,
        projectId: req.query.projectId
      });

      return { gitHubApps };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: z.object({
          gitHubApp: SanitizedGitHubAppSchema
        })
      }
    },
    handler: async (req) => {
      const gitHubApp = await server.services.gitHubApp.deleteGitHubApp({
        orgPermission: req.permission,
        id: req.params.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        ...(gitHubApp.projectId ? { projectId: gitHubApp.projectId } : {}),
        event: {
          type: EventType.DELETE_GITHUB_APP,
          metadata: {
            gitHubAppId: req.params.id,
            name: gitHubApp.name,
            appId: gitHubApp.appId,
            slug: gitHubApp.slug,
            projectId: gitHubApp.projectId
          }
        }
      });

      return { gitHubApp };
    }
  });
};
