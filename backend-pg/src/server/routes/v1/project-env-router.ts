import { z } from "zod";

import { ProjectEnvironmentsSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProjectEnvRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/:workspaceId/environments",
    method: "POST",
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      body: z.object({
        name: z.string().trim(),
        slug: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string(),
          workspace: z.string(),
          environment: ProjectEnvironmentsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const environment = await server.services.projectEnv.createEnvironment({
        actorId: req.permission.id,
        actor: req.permission.type,
        projectId: req.params.workspaceId,
        ...req.body
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
      params: z.object({
        workspaceId: z.string().trim(),
        id: z.string().trim()
      }),
      body: z.object({
        slug: z.string().trim().optional(),
        name: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          message: z.string(),
          workspace: z.string(),
          environment: ProjectEnvironmentsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const environment = await server.services.projectEnv.updateEnvironment({
        actorId: req.permission.id,
        actor: req.permission.type,
        projectId: req.params.workspaceId,
        id: req.params.id,
        ...req.body
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
      params: z.object({
        workspaceId: z.string().trim(),
        id: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string(),
          workspace: z.string(),
          environment: ProjectEnvironmentsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const environment = await server.services.projectEnv.deleteEnvironment({
        actorId: req.permission.id,
        actor: req.permission.type,
        projectId: req.params.workspaceId,
        id: req.params.id
      });
      return {
        message: "Successfully deleted environment",
        workspace: req.params.workspaceId,
        environment
      };
    }
  });
};
