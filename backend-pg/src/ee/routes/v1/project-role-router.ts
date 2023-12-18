import { z } from "zod";

import { ProjectMembershipsSchema, ProjectRolesSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProjectRoleRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectId/roles",
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      body: z.object({
        slug: z.string().trim(),
        name: z.string().trim(),
        description: z.string().trim().optional(),
        permissions: z.any().array()
      }),
      response: {
        200: z.object({
          role: ProjectRolesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const role = await server.services.projectRole.createRole(
        req.permission.type,
        req.permission.id,
        req.params.projectId,
        req.body
      );
      return { role };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:projectId/roles/:roleId",
    schema: {
      params: z.object({
        projectId: z.string().trim(),
        roleId: z.string().trim()
      }),
      body: z.object({
        slug: z.string().trim().optional(),
        name: z.string().trim().optional(),
        description: z.string().trim().optional(),
        permissions: z.any().array()
      }),
      response: {
        200: z.object({
          role: ProjectRolesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const role = await server.services.projectRole.updateRole(
        req.permission.type,
        req.permission.id,
        req.params.projectId,
        req.params.roleId,
        req.body
      );
      return { role };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/roles/:roleId",
    schema: {
      params: z.object({
        projectId: z.string().trim(),
        roleId: z.string().trim()
      }),
      response: {
        200: z.object({
          role: ProjectRolesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const role = await server.services.projectRole.deleteRole(
        req.permission.type,
        req.permission.id,
        req.params.projectId,
        req.params.roleId
      );
      return { role };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/roles",
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          data: z.object({
            roles: ProjectRolesSchema.omit({ permissions: true })
              .merge(z.object({ permissions: z.unknown() }))
              .array()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const roles = await server.services.projectRole.listRoles(
        req.permission.type,
        req.permission.id,
        req.params.projectId
      );
      return { data: { roles } };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/permissions",
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          data: z.object({
            membership: ProjectMembershipsSchema,
            permissions: z.any().array()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { permissions, membership } = await server.services.projectRole.getUserPermission(
        req.auth.userId,
        req.params.projectId
      );
      return { data: { permissions, membership } };
    }
  });
};
