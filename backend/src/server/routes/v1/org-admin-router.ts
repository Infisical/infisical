import { z } from "zod";

import { ProjectMembershipsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { SanitizedProjectSchema } from "../sanitizedSchemas";

export const registerOrgAdminRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/projects",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        search: z.string().optional(),
        offset: z.coerce.number().default(0),
        limit: z.coerce.number().max(100).default(50)
      }),
      response: {
        200: z.object({
          projects: SanitizedProjectSchema.array(),
          count: z.coerce.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { projects, count } = await server.services.orgAdmin.listOrgProjects({
        limit: req.query.limit,
        offset: req.query.offset,
        search: req.query.search,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actor: req.permission.type
      });
      return { projects, count };
    }
  });

  server.route({
    method: "POST",
    url: "/projects/:projectId/grant-admin-access",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          membership: ProjectMembershipsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { membership } = await server.services.orgAdmin.grantProjectAdminAccess({
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actor: req.permission.type,
        projectId: req.params.projectId
      });
      if (req.auth.authMode === AuthMode.JWT) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId: req.params.projectId,
          event: {
            type: EventType.ORG_ADMIN_ACCESS_PROJECT,
            metadata: {
              projectId: req.params.projectId,
              username: req.auth.user.username,
              email: req.auth.user.email || "",
              userId: req.auth.userId
            }
          }
        });
      }

      return { membership };
    }
  });
};
