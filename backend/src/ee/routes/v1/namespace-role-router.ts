import { packRules } from "@casl/ability/extra";
import { z } from "zod";

import { NamespaceRolesSchema } from "@app/db/schemas";
import { NamespacePermissionSchema } from "@app/ee/services/permission/namespace-permission";
import { ApiDocsTags, NAMESPACE_ROLE } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedNamespaceRoleSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerNamespaceRoleRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:namespaceName/roles",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceRoles],
      description: "Create a namespace role",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceName: z.string().trim().describe(NAMESPACE_ROLE.CREATE.namespaceName)
      }),
      body: z.object({
        slug: slugSchema({ min: 1, max: 64 }).describe(NAMESPACE_ROLE.CREATE.slug),
        name: z.string().min(1).trim().describe(NAMESPACE_ROLE.CREATE.name),
        description: z.string().trim().nullish().describe(NAMESPACE_ROLE.CREATE.description),
        permissions: NamespacePermissionSchema.array().describe(NAMESPACE_ROLE.CREATE.permissions)
      }),
      response: {
        200: z.object({
          role: SanitizedNamespaceRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const role = await server.services.namespaceRole.createRole({
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type,
        namespaceName: req.params.namespaceName,
        data: {
          ...req.body,
          permissions: JSON.stringify(packRules(req.body.permissions))
        }
      });
      return { role };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:namespaceName/roles/:roleId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceRoles],
      description: "Update a namespace role",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceName: z.string().trim().describe(NAMESPACE_ROLE.UPDATE.namespaceName),
        roleId: z.string().trim().describe(NAMESPACE_ROLE.UPDATE.roleId)
      }),
      body: z.object({
        slug: slugSchema({ min: 1, max: 64 }).optional().describe(NAMESPACE_ROLE.UPDATE.slug),
        name: z.string().trim().optional().describe(NAMESPACE_ROLE.UPDATE.name),
        description: z.string().trim().nullish().describe(NAMESPACE_ROLE.UPDATE.description),
        permissions: NamespacePermissionSchema.array().describe(NAMESPACE_ROLE.UPDATE.permissions).optional()
      }),
      response: {
        200: z.object({
          role: SanitizedNamespaceRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const role = await server.services.namespaceRole.updateRole({
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type,
        roleId: req.params.roleId,
        data: {
          ...req.body,
          permissions: req.body.permissions ? JSON.stringify(packRules(req.body.permissions)) : undefined
        }
      });
      return { role };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:namespaceName/roles/:roleId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceRoles],
      description: "Delete a namespace role",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceName: z.string().trim().describe(NAMESPACE_ROLE.DELETE.namespaceName),
        roleId: z.string().trim().describe(NAMESPACE_ROLE.DELETE.roleId)
      }),
      response: {
        200: z.object({
          role: SanitizedNamespaceRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const role = await server.services.namespaceRole.deleteRole({
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type,
        roleId: req.params.roleId
      });
      return { role };
    }
  });

  server.route({
    method: "GET",
    url: "/:namespaceName/roles",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceRoles],
      description: "List namespace roles",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceName: z.string().trim().describe(NAMESPACE_ROLE.LIST.namespaceName)
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0).describe(NAMESPACE_ROLE.LIST.offset),
        limit: z.coerce.number().min(1).max(10000).default(50).describe(NAMESPACE_ROLE.LIST.limit),
        search: z.string().optional().describe(NAMESPACE_ROLE.LIST.search)
      }),
      response: {
        200: z.object({
          roles: NamespaceRolesSchema.omit({ permissions: true }).array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { roles, totalCount } = await server.services.namespaceRole.listRoles({
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type,
        namespaceName: req.params.namespaceName,
        offset: req.query.offset,
        limit: req.query.limit,
        search: req.query.search
      });
      return { roles, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:namespaceName/roles/slug/:roleSlug",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceRoles],
      description: "Get namespace role by slug",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceName: z.string().trim().describe(NAMESPACE_ROLE.GET_ROLE_BY_SLUG.namespaceName),
        roleSlug: z.string().trim().describe(NAMESPACE_ROLE.GET_ROLE_BY_SLUG.roleSlug)
      }),
      response: {
        200: z.object({
          role: SanitizedNamespaceRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const role = await server.services.namespaceRole.getRoleBySlug({
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type,
        namespaceName: req.params.namespaceName,
        roleName: req.params.roleSlug
      });
      return { role };
    }
  });

  server.route({
    method: "GET",
    url: "/:namespaceName/permissions",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get user namespace permissions",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceName: z.string().trim().describe(NAMESPACE_ROLE.GET_USER_PERMISSIONS.namespaceName)
      }),
      response: {
        200: z.object({
          data: z.object({
            membership: z.object({
              id: z.string(),
              roles: z
                .object({
                  role: z.string()
                })
                .array()
            }),
            permissions: z.any().array()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { permissions, membership } = await server.services.namespaceRole.getUserPermission(
        req.permission.id,
        req.params.namespaceName,
        req.permission.authMethod,
        req.permission.orgId
      );

      return {
        data: {
          permissions,
          membership
        }
      };
    }
  });
};
