import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { ProjectKeysSchema, ProjectsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { authRateLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const projectWithEnv = ProjectsSchema.merge(
  z.object({
    _id: z.string(),
    environments: z.object({ name: z.string(), slug: z.string(), id: z.string() }).array()
  })
);

export const registerProjectRouter = async (server: FastifyZodProvider) => {
  /* Get project key */
  server.route({
    url: "/:workspaceId/encrypted-key",
    method: "GET",
    schema: {
      description: "Return encrypted project key",
      security: [
        {
          apiKeyAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim()
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
        projectId: req.params.workspaceId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
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
        slug: z
          .string()
          .min(5)
          .max(36)
          .refine((v) => slugify(v) === v, {
            message: "Slug must be a valid slug"
          })
          .optional(),
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
        workspaceName: req.body.projectName,
        slug: req.body.slug
      });

      server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.ProjectCreated,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          orgId: req.body.organizationId,
          name: project.name,
          ...req.auditLogInfo
        }
      });

      return { project };
    }
  });
};
