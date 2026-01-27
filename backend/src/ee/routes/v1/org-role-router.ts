import { packRules } from "@casl/ability/extra";
import { z } from "zod";

import { AccessScope, OrgMembershipRole, OrgRolesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { OrgPermissionSchema, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { ApiDocsTags, ORG_ROLE } from "@app/lib/api-docs";
import { BadRequestError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedOrgRoleSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

const INVALID_SUBORG_PERMISSIONS = [
  OrgPermissionSubjects.Sso,
  OrgPermissionSubjects.Ldap,
  OrgPermissionSubjects.Scim,
  OrgPermissionSubjects.GithubOrgSync,
  OrgPermissionSubjects.GithubOrgSyncManual,
  OrgPermissionSubjects.Billing,
  OrgPermissionSubjects.SubOrganization
];

const validateSubOrganizationSubjects = (permissions: unknown) => {
  const invalidPermissionSubjects = (permissions as { subject: OrgPermissionSubjects }[])
    .filter((el) => INVALID_SUBORG_PERMISSIONS.includes(el.subject))
    .map((el) => el.subject);
  if (invalidPermissionSubjects.length) {
    const deduplication = Array.from(new Set(invalidPermissionSubjects));
    throw new BadRequestError({
      message: `Suborganization contains invalid permission subjects: ${deduplication.join(",")}`
    });
  }
};

export const registerOrgRoleRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/roles",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.OrganizationRoles],
      description: "Create an organization role",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        slug: slugSchema({ min: 1, max: 64 })
          .refine(
            (val) => !Object.values(OrgMembershipRole).includes(val as OrgMembershipRole),
            "Please choose a different slug, the slug you have entered is reserved"
          )
          .describe(ORG_ROLE.CREATE.slug),
        name: z.string().min(1).trim().describe(ORG_ROLE.CREATE.name),
        description: z.string().trim().nullish().describe(ORG_ROLE.CREATE.description),
        permissions: OrgPermissionSchema.array().describe(ORG_ROLE.CREATE.permissions)
      }),
      response: {
        200: z.object({
          role: SanitizedOrgRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const isSubOrganization = req.permission.rootOrgId !== req.permission.orgId;
      if (isSubOrganization) {
        validateSubOrganizationSubjects(req.body.permissions);
      }

      const stringifiedPermissions = JSON.stringify(packRules(req.body.permissions));
      const role = await server.services.role.createRole({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
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
    url: "/roles/:roleId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.OrganizationRoles],
      description: "Get an organization role",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        roleId: z.string().trim().describe(ORG_ROLE.GET.roleId)
      }),
      response: {
        200: z.object({
          role: SanitizedOrgRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const role = await server.services.role.getRoleById({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
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
    url: "/roles/:roleId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.OrganizationRoles],
      description: "Update an organization role",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        roleId: z.string().trim().describe(ORG_ROLE.UPDATE.roleId)
      }),
      body: z.object({
        slug: slugSchema({ min: 1, max: 64 })
          .refine(
            (val) => !Object.values(OrgMembershipRole).includes(val as OrgMembershipRole),
            "Please choose a different slug, the slug you have entered is reserved"
          )
          .optional()
          .describe(ORG_ROLE.UPDATE.slug),
        name: z.string().trim().optional().describe(ORG_ROLE.UPDATE.name),
        description: z.string().trim().nullish().describe(ORG_ROLE.UPDATE.description),
        permissions: OrgPermissionSchema.array().optional().describe(ORG_ROLE.UPDATE.permissions)
      }),
      response: {
        200: z.object({
          role: SanitizedOrgRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const isSubOrganization = req.permission.rootOrgId !== req.permission.orgId;
      if (isSubOrganization && req.body.permissions) {
        validateSubOrganizationSubjects(req.body.permissions);
      }

      const stringifiedPermissions = req.body.permissions ? JSON.stringify(packRules(req.body.permissions)) : undefined;
      const role = await server.services.role.updateRole({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
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
    url: "/roles/:roleId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.OrganizationRoles],
      description: "Delete an organization role",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        roleId: z.string().trim().describe(ORG_ROLE.DELETE.roleId)
      }),
      response: {
        200: z.object({
          role: SanitizedOrgRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const role = await server.services.role.deleteRole({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
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

  server.route({
    method: "GET",
    url: "/roles",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.OrganizationRoles],
      description: "List organization roles",
      security: [
        {
          bearerAuth: []
        }
      ],
      response: {
        200: z.object({
          roles: OrgRolesSchema.omit({ permissions: true }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { roles } = await server.services.role.listRoles({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
        },
        data: {}
      });
      return { roles: roles.map((el) => ({ ...el, orgId: el.orgId as string })) };
    }
  });

  server.route({
    method: "GET",
    url: "/roles/slug/:roleSlug",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.OrganizationRoles],
      description: "Get an organization role by slug",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        roleSlug: z.string().trim().describe(ORG_ROLE.GET_ROLE_BY_SLUG.roleSlug)
      }),
      response: {
        200: z.object({
          role: SanitizedOrgRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const role = await server.services.role.getRoleBySlug({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
        },
        selector: {
          slug: req.params.roleSlug
        }
      });

      return { role: { ...role, orgId: role.orgId as string } };
    }
  });

  server.route({
    method: "GET",
    url: "/permissions",
    config: {
      rateLimit: readLimit
    },
    schema: {
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
          scope: AccessScope.Organization,
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
