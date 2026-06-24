import { packRules } from "@casl/ability/extra";
import { z } from "zod";

import { AccessScope, ProjectMembershipRole, ProjectRolesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { checkForInvalidPermissionCombination } from "@app/ee/services/permission/permission-fns";
import { ProjectPermissionSub, ProjectPermissionV2Schema } from "@app/ee/services/permission/project-permission";
import { ApiDocsTags, PROJECT_ROLE } from "@app/lib/api-docs";
import { getConfig } from "@app/lib/config/env";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedRoleSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerProjectRoleRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectId/roles",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectRoles],
      description: "Create a project role",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_ROLE.CREATE.projectId)
      }),
      body: z.object({
        slug: slugSchema({ min: 1, max: 64 })
          .refine(
            (val) => !Object.values(ProjectMembershipRole).includes(val as ProjectMembershipRole),
            "Please choose a different slug, the slug you have entered is reserved"
          )
          .describe(PROJECT_ROLE.CREATE.slug),
        name: z.string().min(1).trim().describe(PROJECT_ROLE.CREATE.name),
        description: z.string().trim().nullish().describe(PROJECT_ROLE.CREATE.description),
        permissions: ProjectPermissionV2Schema.array()
          .describe(PROJECT_ROLE.CREATE.permissions)
          .refine(checkForInvalidPermissionCombination)
      }),
      response: {
        200: z.object({
          role: SanitizedRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const appCfg = getConfig();
      const isCrossProjectEnabled = appCfg.CROSS_PROJECT_SECRET_SHARING_ORG_WHITELIST.includes(req.permission.orgId);
      const permissions = isCrossProjectEnabled
        ? req.body.permissions
        : req.body.permissions.filter((p) => p.subject !== ProjectPermissionSub.ProjectGrant);

      const stringifiedPermissions = JSON.stringify(packRules(permissions));

      const role = await server.services.role.createRole({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        data: {
          ...req.body,
          permissions: stringifiedPermissions
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: role.projectId as string,
        event: {
          type: EventType.CREATE_PROJECT_ROLE,
          metadata: {
            roleId: role.id,
            slug: req.body.slug,
            name: req.body.name,
            description: req.body.description,
            permissions: stringifiedPermissions
          }
        }
      });

      void server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.CustomRoleCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          roleId: role.id,
          name: req.body.name,
          slug: req.body.slug,
          scope: "project"
        }
      });

      return { role: { ...role, projectId: role.projectId as string } };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:projectId/roles/:roleId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectRoles],
      description: "Update a project role",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_ROLE.UPDATE.projectId),
        roleId: z.string().trim().describe(PROJECT_ROLE.UPDATE.roleId)
      }),
      body: z.object({
        slug: slugSchema({ min: 1, max: 64 })
          .refine(
            (val) => !Object.values(ProjectMembershipRole).includes(val as ProjectMembershipRole),
            "Please choose a different slug, the slug you have entered is reserved"
          )
          .optional()
          .describe(PROJECT_ROLE.UPDATE.slug),
        name: z.string().trim().optional().describe(PROJECT_ROLE.UPDATE.name),
        description: z.string().trim().nullish().describe(PROJECT_ROLE.UPDATE.description),
        permissions: ProjectPermissionV2Schema.array()
          .describe(PROJECT_ROLE.UPDATE.permissions)
          .optional()
          .superRefine(checkForInvalidPermissionCombination)
      }),
      response: {
        200: z.object({
          role: SanitizedRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const appCfg = getConfig();
      const isCrossProjectEnabled = appCfg.CROSS_PROJECT_SECRET_SHARING_ORG_WHITELIST.includes(req.permission.orgId);
      const filteredPermissions = req.body.permissions
        ? req.body.permissions.filter((p) => isCrossProjectEnabled || p.subject !== ProjectPermissionSub.ProjectGrant)
        : undefined;

      const stringifiedPermissions = filteredPermissions ? JSON.stringify(packRules(filteredPermissions)) : undefined;
      const role = await server.services.role.updateRole({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
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
        projectId: role.projectId as string,
        event: {
          type: EventType.UPDATE_PROJECT_ROLE,
          metadata: {
            roleId: role.id,
            slug: req.body.slug,
            name: req.body.name,
            description: req.body.description,
            permissions: stringifiedPermissions
          }
        }
      });

      void server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.CustomRoleUpdated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          roleId: role.id,
          name: req.body.name,
          slug: req.body.slug,
          scope: "project",
          permissionsUpdated: !!req.body.permissions
        }
      });

      return { role: { ...role, projectId: role.projectId as string } };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/roles/:roleId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectRoles],
      description: "Delete a project role",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_ROLE.DELETE.projectId),
        roleId: z.string().trim().describe(PROJECT_ROLE.DELETE.roleId)
      }),
      response: {
        200: z.object({
          role: SanitizedRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const role = await server.services.role.deleteRole({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        selector: {
          id: req.params.roleId
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: role.projectId as string,
        event: {
          type: EventType.DELETE_PROJECT_ROLE,
          metadata: {
            roleId: role.id,
            slug: role.slug,
            name: role.name
          }
        }
      });

      void server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.CustomRoleDeleted,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          roleId: role.id,
          name: role.name,
          slug: role.slug,
          scope: "project"
        }
      });

      return { role: { ...role, projectId: role.projectId as string } };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/roles",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectRoles],
      description: "List project role",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_ROLE.LIST.projectId)
      }),
      response: {
        200: z.object({
          roles: ProjectRolesSchema.omit({ permissions: true, version: true }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { roles } = await server.services.role.listRoles({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        data: {}
      });
      return { roles: roles.map((el) => ({ ...el, projectId: el.projectId as string })) };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/roles/slug/:roleSlug",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectRoles],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_ROLE.GET_ROLE_BY_SLUG.projectId),
        roleSlug: z.string().trim().describe(PROJECT_ROLE.GET_ROLE_BY_SLUG.roleSlug)
      }),
      response: {
        200: z.object({
          role: SanitizedRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const role = await server.services.role.getRoleBySlug({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        selector: {
          slug: req.params.roleSlug
        }
      });

      return { role: { ...role, projectId: role.projectId as string } };
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
      tags: [ApiDocsTags.ProjectRoles],
      description: "Get a project role by ID",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        roleId: z.string().trim().uuid().describe(PROJECT_ROLE.GET_ROLE_BY_ID.roleId)
      }),
      response: {
        200: z.object({
          role: SanitizedRoleSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const role = await server.services.role.getProjectRoleById({
        permission: req.permission,
        selector: {
          id: req.params.roleId
        }
      });

      return { role };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/permissions",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          data: z.object({
            memberships: z
              .object({
                id: z.string(),
                actorGroupId: z.string().nullish(),
                actorUserId: z.string().nullish(),
                roles: z
                  .object({
                    role: z.string()
                  })
                  .array()
              })
              .array(),
            assumedPrivilegeDetails: z
              .object({
                actorId: z.string(),
                actorType: z.string(),
                actorName: z.string(),
                actorEmail: z.string().optional()
              })
              .optional(),
            permissions: z.any().array()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { permissions, memberships, assumedPrivilegeDetails } = await server.services.role.getUserPermission({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          projectId: req.params.projectId,
          orgId: req.permission.orgId
        }
      });

      return {
        data: {
          permissions,
          memberships,
          assumedPrivilegeDetails
        }
      };
    }
  });
};
