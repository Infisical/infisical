import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { ProjectKeysSchema, ProjectsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { authRateLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { ProjectFilterType } from "@app/services/project/project-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const projectWithEnv = ProjectsSchema.merge(
  z.object({
    _id: z.string(),
    environments: z.object({ name: z.string(), slug: z.string(), id: z.string() }).array()
  })
);

const slugSchema = z
  .string()
  .min(5)
  .max(36)
  .refine((v) => slugify(v) === v, {
    message: "Slug must be at least 5 character but no more than 36"
  });

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
        actorAuthMethod: req.permission.authMethod,
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
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.project.upgradeProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
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
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const status = await server.services.project.getProjectUpgradeStatus({
        actorAuthMethod: req.permission.authMethod,
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
        projectName: z.string().trim().describe("Name of the project you're creating"),
        slug: slugSchema
          .optional()
          .describe("An optional slug for the project. If not provided, it will be auto-generated"),
        organizationSlug: z.string().trim().describe("The slug of the organization to create the project in")
      }),
      response: {
        200: z.object({
          project: projectWithEnv
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const project = await server.services.project.createProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        orgSlug: req.body.organizationSlug,
        workspaceName: req.body.projectName,
        slug: req.body.slug
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.ProjectCreated,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          orgId: project.orgId,
          name: project.name,
          ...req.auditLogInfo
        }
      });

      return { project };
    }
  });

  /* Delete a project by slug */
  server.route({
    method: "DELETE",
    url: "/:slug",
    schema: {
      params: z.object({
        slug: slugSchema.describe("The slug of the project to delete.")
      }),
      response: {
        200: ProjectsSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),

    handler: async (req) => {
      const project = await server.services.project.deleteProject({
        filter: {
          type: ProjectFilterType.SLUG,
          slug: req.params.slug,
          orgId: req.permission.orgId
        },
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type
      });

      return project;
    }
  });

  /* Get a project by slug */
  server.route({
    method: "GET",
    url: "/:slug",
    schema: {
      params: z.object({
        slug: slugSchema.describe("The slug of the project to get.")
      }),
      response: {
        200: projectWithEnv
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const project = await server.services.project.getAProject({
        filter: {
          slug: req.params.slug,
          orgId: req.permission.orgId,
          type: ProjectFilterType.SLUG
        },
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });

      return project;
    }
  });

  /* Update a project by slug */
  server.route({
    method: "PATCH",
    url: "/:slug",
    schema: {
      params: z.object({
        slug: slugSchema.describe("The slug of the project to update.")
      }),
      body: z.object({
        name: z.string().trim().optional().describe("The new name of the project."),
        autoCapitalization: z.boolean().optional().describe("The new auto-capitalization setting.")
      }),
      response: {
        200: ProjectsSchema
      }
    },

    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const project = await server.services.project.updateProject({
        filter: {
          type: ProjectFilterType.SLUG,
          slug: req.params.slug,
          orgId: req.permission.orgId
        },
        update: {
          name: req.body.name,
          autoCapitalization: req.body.autoCapitalization
        },
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
      });

      return project;
    }
  });
};
