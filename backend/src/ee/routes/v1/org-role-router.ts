import { z } from "zod";

import { OrgMembershipsSchema, OrgRolesSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerOrgRoleRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:organizationId/roles",
    schema: {
      params: z.object({
        organizationId: z.string().trim()
      }),
      body: z.object({
        slug: z.string().trim(),
        name: z.string().trim(),
        description: z.string().trim().optional(),
        permissions: z.any().array()
      }),
      response: {
        200: z.object({
          role: OrgRolesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      
      const role = await server.services.orgRole.createRole(
        req.permission.id,
        req.params.organizationId,
        req.body
      );
      return { role };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:organizationId/roles/:roleId",
    schema: {
      params: z.object({
        organizationId: z.string().trim(),
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
          role: OrgRolesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      
      const role = await server.services.orgRole.updateRole(
        req.permission.id,
        req.params.organizationId,
        req.params.roleId,
        req.body
      );
      return { role };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:organizationId/roles/:roleId",
    schema: {
      params: z.object({
        organizationId: z.string().trim(),
        roleId: z.string().trim()
      }),
      response: {
        200: z.object({
          role: OrgRolesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      
      const role = await server.services.orgRole.deleteRole(
        req.permission.id,
        req.params.organizationId,
        req.params.roleId
      );
      return { role };
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/roles",
    schema: {
      params: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          data: z.object({
            roles: OrgRolesSchema.omit({ permissions: true })
              .merge(z.object({ permissions: z.unknown() }))
              .array()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      
      const roles = await server.services.orgRole.listRoles(
        req.permission.id,
        req.params.organizationId
      );
      return { data: { roles } };
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/permissions",
    schema: {
      params: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          membership: OrgMembershipsSchema,
          permissions: z.any().array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      
      const { permissions, membership } = await server.services.orgRole.getUserPermission(
        req.permission.id,
        req.params.organizationId
      );
      return { permissions, membership };
    }
  });
};
