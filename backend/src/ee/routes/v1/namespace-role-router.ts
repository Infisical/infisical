import { packRules } from "@casl/ability/extra";
import { z } from "zod";

import { AccessScope, NamespaceMembershipRole } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { NamespacePermissionSchema } from "@app/ee/services/permission/namespace-permission";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedNamespaceRoleSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerNamespaceRoleRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:namespaceId/roles",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        namespaceId: z.string().trim()
      }),
      body: z.object({
        slug: slugSchema({ min: 1, max: 64 }).refine(
          (val) => !Object.values(NamespaceMembershipRole).includes(val as NamespaceMembershipRole),
          "Please choose a different slug, the slug you have entered is reserved"
        ),
        name: z.string().trim(),
        description: z.string().trim().nullish(),
        permissions: NamespacePermissionSchema.array()
      }),
      response: {
        200: z.object({
          role: SanitizedNamespaceRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const stringifiedPermissions = JSON.stringify(packRules(req.body.permissions));
      const role = await server.services.role.createRole({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          namespaceId: req.params.namespaceId,
          orgId: req.permission.orgId
        },
        data: {
          ...req.body,
          permissions: stringifiedPermissions
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        namespaceId: req.params.namespaceId,
        event: {
          type: EventType.CREATE_NAMESPACE_ROLE,
          metadata: {
            roleId: role.id,
            slug: req.body.slug,
            name: req.body.name,
            description: req.body.description,
            permissions: JSON.stringify(req.body.permissions)
          }
        }
      });

      return { role: { ...role, namespaceId: req.params.namespaceId } };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:namespaceId/roles/:roleId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        namespaceId: z.string().trim(),
        roleId: z.string().trim()
      }),
      body: z.object({
        slug: slugSchema({ min: 1, max: 64 })
          .refine(
            (val) => !Object.values(NamespaceMembershipRole).includes(val as NamespaceMembershipRole),
            "Please choose a different slug, the slug you have entered is reserved."
          )
          .optional(),
        name: z.string().trim().optional(),
        description: z.string().trim().nullish(),
        permissions: NamespacePermissionSchema.array().optional()
      }),
      response: {
        200: z.object({
          role: SanitizedNamespaceRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const stringifiedPermissions = req.body.permissions ? JSON.stringify(packRules(req.body.permissions)) : undefined;
      const role = await server.services.role.updateRole({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          namespaceId: req.params.namespaceId,
          orgId: req.permission.orgId
        },
        selector: {
          id: req.params.roleId
        },
        data: {
          ...req.body,
          permissions: stringifiedPermissions
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        namespaceId: req.params.namespaceId,
        event: {
          type: EventType.UPDATE_NAMESPACE_ROLE,
          metadata: {
            roleId: role.id,
            slug: req.body.slug,
            name: req.body.name,
            description: req.body.description,
            permissions: req.body.permissions ? JSON.stringify(req.body.permissions) : undefined
          }
        }
      });

      return { role: { ...role, namespaceId: req.params.namespaceId } };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:namespaceId/roles/:roleId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        namespaceId: z.string().trim(),
        roleId: z.string().trim()
      }),
      response: {
        200: z.object({
          role: SanitizedNamespaceRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const role = await server.services.role.deleteRole({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          namespaceId: req.params.namespaceId,
          orgId: req.permission.orgId
        },
        selector: {
          id: req.params.roleId
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        namespaceId: req.params.namespaceId,
        event: {
          type: EventType.DELETE_NAMESPACE_ROLE,
          metadata: { roleId: role.id, slug: role.slug, name: role.name }
        }
      });

      return { role: { ...role, namespaceId: req.params.namespaceId } };
    }
  });

  server.route({
    method: "GET",
    url: "/:namespaceId/roles",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        namespaceId: z.string().trim()
      }),
      response: {
        200: z.object({
          roles: SanitizedNamespaceRoleSchema.omit({ permissions: true }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { roles } = await server.services.role.listRoles({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          namespaceId: req.params.namespaceId,
          orgId: req.permission.orgId
        },
        data: {}
      });
      return {
        roles: roles.map((el) => ({ ...el, namespaceId: req.params.namespaceId }))
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:namespaceId/roles/:roleId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        namespaceId: z.string().trim(),
        roleId: z.string().trim()
      }),
      response: {
        200: z.object({
          role: SanitizedNamespaceRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const role = await server.services.role.getRoleById({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          namespaceId: req.params.namespaceId,
          orgId: req.permission.orgId
        },
        selector: {
          id: req.params.roleId
        }
      });
      return { role: { ...role, namespaceId: req.params.namespaceId } };
    }
  });

  server.route({
    method: "GET",
    url: "/:namespaceId/roles/slug/:roleSlug",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        namespaceId: z.string().trim(),
        roleSlug: z.string().trim()
      }),
      response: {
        200: z.object({
          role: SanitizedNamespaceRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const role = await server.services.role.getRoleBySlug({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          namespaceId: req.params.namespaceId,
          orgId: req.permission.orgId
        },
        selector: {
          slug: req.params.roleSlug
        }
      });
      return { role: { ...role, namespaceId: req.params.namespaceId } };
    }
  });

  server.route({
    method: "GET",
    url: "/:namespaceId/permissions",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        namespaceId: z.string().trim()
      }),
      response: {
        200: z.object({
          memberships: z
            .object({
              id: z.string(),
              roles: z
                .object({
                  role: z.string()
                })
                .array()
            })
            .array(),
          permissions: z.any().array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { permissions, memberships } = await server.services.role.getUserPermission({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          namespaceId: req.params.namespaceId,
          orgId: req.permission.orgId
        }
      });
      return {
        permissions,
        memberships
      };
    }
  });
};
