import { packRules } from "@casl/ability/extra";
import { z } from "zod";

import { AccessScope, OrgMembershipRole, OrgMembershipsSchema, OrgRolesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { OrgPermissionSchema } from "@app/ee/services/permission/org-permission";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerOrgRoleRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:organizationId/roles",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        organizationId: z.string().trim()
      }),
      body: z.object({
        slug: slugSchema({ min: 1, max: 64 }).refine(
          (val) => !Object.values(OrgMembershipRole).includes(val as OrgMembershipRole),
          "Please choose a different slug, the slug you have entered is reserved"
        ),
        name: z.string().trim(),
        description: z.string().trim().nullish(),
        permissions: OrgPermissionSchema.array()
      }),
      response: {
        200: z.object({
          role: OrgRolesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const stringifiedPermissions = JSON.stringify(packRules(req.body.permissions));
      const role = await server.services.role.createRole({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.params.organizationId
        },
        data: {
          ...req.body,
          permissions: stringifiedPermissions
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.CREATE_ORG_ROLE,
          metadata: {
            roleId: role.id,
            slug: req.body.slug,
            name: req.body.name,
            description: req.body.description,
            permissions: JSON.stringify(req.body.permissions)
          }
        }
      });

      return { role: { ...role, orgId: role.orgId as string } };
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/roles/:roleId",
    config: {
      rateLimit: readLimit
    },
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
      const role = await server.services.role.getRoleById({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.params.organizationId
        },
        selector: {
          id: req.params.roleId
        }
      });
      return { role: { ...role, orgId: role.orgId as string } };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:organizationId/roles/:roleId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        organizationId: z.string().trim(),
        roleId: z.string().trim()
      }),
      body: z.object({
        // TODO: Switch to slugSchema after verifying correct methods with Akhil - Omar 11/24
        slug: slugSchema({ min: 1, max: 64 })
          .refine(
            (val) => !Object.keys(OrgMembershipRole).includes(val),
            "Please choose a different slug, the slug you have entered is reserved."
          )
          .optional(),
        name: z.string().trim().optional(),
        description: z.string().trim().nullish(),
        permissions: OrgPermissionSchema.array().optional()
      }),
      response: {
        200: z.object({
          role: OrgRolesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const stringifiedPermissions = req.body.permissions ? JSON.stringify(packRules(req.body.permissions)) : undefined;
      const role = await server.services.role.updateRole({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.params.organizationId
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
        event: {
          type: EventType.UPDATE_ORG_ROLE,
          metadata: {
            roleId: role.id,
            slug: req.body.slug,
            name: req.body.name,
            description: req.body.description,
            permissions: req.body.permissions ? JSON.stringify(req.body.permissions) : undefined
          }
        }
      });

      return { role: { ...role, orgId: role.orgId as string } };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:organizationId/roles/:roleId",
    config: {
      rateLimit: writeLimit
    },
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
      const role = await server.services.role.deleteRole({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.params.organizationId
        },
        selector: {
          id: req.params.roleId
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.DELETE_ORG_ROLE,
          metadata: { roleId: role.id, slug: role.slug, name: role.name }
        }
      });

      return { role: { ...role, orgId: role.orgId as string } };
    }
  });

  // TODO(simp): switch to top level roles
  server.route({
    method: "GET",
    url: "/:organizationId/roles",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          data: z.object({
            roles: OrgRolesSchema.omit({ permissions: true }).array()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { roles } = await server.services.role.listRoles({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
        },
        data: {}
      });
      return {
        data: {
          roles: roles.map((el) => ({ ...el, orgId: el.orgId as string }))
        }
      };
    }
  });

  // TODO(simp): get this fixed
  server.route({
    method: "GET",
    url: "/:organizationId/permissions",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        organizationId: z.string().trim()
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
      const { permissions, memberships } = await server.services.orgRole.getUserPermission(
        req.permission.id,
        req.params.organizationId,
        req.permission.authMethod,
        req.permission.orgId
      );
      return {
        permissions,
        memberships: memberships.map((el) => ({
          ...el,
          role: el.roles[0].customRoleSlug || el.roles[0].role,
          orgId: el.scopeOrgId,
          status: el.status || "",
          isActive: el.isActive || true
        }))
      };
    }
  });
};
