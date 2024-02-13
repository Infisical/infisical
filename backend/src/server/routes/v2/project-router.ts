import { z } from "zod";

import { ProjectKeysSchema, ProjectsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { authRateLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const projectWithEnv = ProjectsSchema.merge(
  z.object({
    _id: z.string(),
    environments: z.object({ name: z.string(), slug: z.string(), id: z.string() }).array()
  })
);

export const registerProjectRouter = async (server: FastifyZodProvider) => {
  /* Get project key */
  server.route({
    url: "/:projectId/encrypted-key",
    method: "GET",
    schema: {
      description: "Return encrypted project key",
      security: [
        {
          apiKeyAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: ProjectKeysSchema.merge(
          z.object({
            sender: z.object({
              publicKey: z.string()
            })
          })
        )
      }
    },
    onResponse: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const key = await server.services.projectKey.getLatestProjectKey({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.projectId,
        event: {
          type: EventType.GET_WORKSPACE_KEY,
          metadata: {
            keyId: key?.id as string
          }
        }
      });

      return key;
    }
  });

  /* Start upgrade of a project */
  server.route({
    url: "/:projectId/upgrade",
    method: "POST",
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),

      body: z.object({
        userPrivateKey: z.string().trim()
      }),
      response: {
        200: z.void()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      await server.services.project.upgradeProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        projectId: req.params.projectId,
        userPrivateKey: req.body.userPrivateKey
      });
    }
  });

  /* Get upgrade status of project */
  server.route({
    url: "/:projectId/upgrade/status",
    method: "GET",
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          status: z.string().nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const status = await server.services.project.getProjectUpgradeStatus({
        projectId: req.params.projectId,
        actor: req.permission.type,
        actorId: req.permission.id
      });

      return { status };
    }
  });

  /* Create new project */
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z.object({
        projectName: z.string().trim(),
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          project: projectWithEnv
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const project = await server.services.project.createProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        orgId: req.body.organizationId,
        workspaceName: req.body.projectName
      });

      return { project };
    }
  });
};
