import { z } from "zod";

import { ProjectEnvironmentsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, ENVIRONMENTS } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProjectEnvRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:projectId/environments/:envId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getEnvironmentById",
      tags: [ApiDocsTags.Environments],
      description: "Get Environment by ID",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        envId: z.string().trim().describe(ENVIRONMENTS.GET.id),
        projectId: z.string().trim().describe(ENVIRONMENTS.GET.projectId)
      }),
      response: {
        200: z.object({
          environment: ProjectEnvironmentsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const environment = await server.services.projectEnv.getEnvironmentById({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        id: req.params.envId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: environment.projectId,
        event: {
          type: EventType.GET_ENVIRONMENT,
          metadata: {
            id: environment.id
          }
        }
      });

      return { environment };
    }
  });

  server.route({
    method: "POST",
    url: "/:projectId/environments",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "createEnvironment",
      tags: [ApiDocsTags.Environments],
      description: "Create environment",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(ENVIRONMENTS.CREATE.projectId)
      }),
      body: z.object({
        name: z.string().trim().describe(ENVIRONMENTS.CREATE.name),
        position: z.number().min(1).optional().describe(ENVIRONMENTS.CREATE.position),
        slug: slugSchema({ max: 64 }).describe(ENVIRONMENTS.CREATE.slug)
      }),
      response: {
        200: z.object({
          message: z.string(),
          projectId: z.string(),
          environment: ProjectEnvironmentsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const environment = await server.services.projectEnv.createEnvironment({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        projectId: req.params.projectId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: environment.projectId,
        event: {
          type: EventType.CREATE_ENVIRONMENT,
          metadata: {
            name: environment.name,
            slug: environment.slug
          }
        }
      });
      return {
        message: "Successfully created new environment",
        projectId: req.params.projectId,
        environment
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:projectId/environments/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "updateEnvironment",
      tags: [ApiDocsTags.Environments],
      description: "Update environment",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(ENVIRONMENTS.UPDATE.projectId),
        id: z.string().trim().describe(ENVIRONMENTS.UPDATE.id)
      }),
      body: z.object({
        slug: slugSchema({ max: 64 }).optional().describe(ENVIRONMENTS.UPDATE.slug),
        name: z.string().trim().optional().describe(ENVIRONMENTS.UPDATE.name),
        position: z.number().optional().describe(ENVIRONMENTS.UPDATE.position)
      }),
      response: {
        200: z.object({
          message: z.string(),
          projectId: z.string(),
          environment: ProjectEnvironmentsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { environment, old } = await server.services.projectEnv.updateEnvironment({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        id: req.params.id,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: environment.projectId,
        event: {
          type: EventType.UPDATE_ENVIRONMENT,
          metadata: {
            oldName: old.name,
            oldSlug: old.slug,
            oldPos: old.position,
            newName: environment.name,
            newSlug: environment.slug,
            newPos: environment.position
          }
        }
      });

      return {
        message: "Successfully updated environment",
        projectId: req.params.projectId,
        environment
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/environments/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "deleteEnvironment",
      tags: [ApiDocsTags.Environments],
      description: "Delete environment",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(ENVIRONMENTS.DELETE.projectId),
        id: z.string().trim().describe(ENVIRONMENTS.DELETE.id)
      }),
      response: {
        200: z.object({
          message: z.string(),
          projectId: z.string(),
          environment: ProjectEnvironmentsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const environment = await server.services.projectEnv.deleteEnvironment({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        id: req.params.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: environment.projectId,
        event: {
          type: EventType.DELETE_ENVIRONMENT,
          metadata: {
            slug: environment.slug,
            name: environment.name
          }
        }
      });

      return {
        message: "Successfully deleted environment",
        projectId: req.params.projectId,
        environment
      };
    }
  });
};
