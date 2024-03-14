import { z } from "zod";

import { ProjectEnvironmentsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ENVIRONMENTS } from "@app/lib/api-docs";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProjectEnvRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/:workspaceId/environments",
    method: "POST",
    schema: {
      description: "Create environment",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(ENVIRONMENTS.CREATE.workspaceId)
      }),
      body: z.object({
        name: z.string().trim().describe(ENVIRONMENTS.CREATE.name),
        slug: z.string().trim().describe(ENVIRONMENTS.CREATE.slug)
      }),
      response: {
        200: z.object({
          message: z.string(),
          workspace: z.string(),
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
        projectId: req.params.workspaceId,
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
        workspace: req.params.workspaceId,
        environment
      };
    }
  });

  server.route({
    url: "/:workspaceId/environments/:id",
    method: "PATCH",
    schema: {
      description: "Update environment",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(ENVIRONMENTS.UPDATE.workspaceId),
        id: z.string().trim().describe(ENVIRONMENTS.UPDATE.id)
      }),
      body: z.object({
        slug: z.string().trim().optional().describe(ENVIRONMENTS.UPDATE.slug),
        name: z.string().trim().optional().describe(ENVIRONMENTS.UPDATE.name),
        position: z.number().optional().describe(ENVIRONMENTS.UPDATE.position)
      }),
      response: {
        200: z.object({
          message: z.string(),
          workspace: z.string(),
          environment: ProjectEnvironmentsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { environment, old } = await server.services.projectEnv.updateEnvironment({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId,
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
        workspace: req.params.workspaceId,
        environment
      };
    }
  });

  server.route({
    url: "/:workspaceId/environments/:id",
    method: "DELETE",
    schema: {
      description: "Delete environment",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(ENVIRONMENTS.DELETE.workspaceId),
        id: z.string().trim().describe(ENVIRONMENTS.DELETE.id)
      }),
      response: {
        200: z.object({
          message: z.string(),
          workspace: z.string(),
          environment: ProjectEnvironmentsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const environment = await server.services.projectEnv.deleteEnvironment({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId,
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
        workspace: req.params.workspaceId,
        environment
      };
    }
  });
};
