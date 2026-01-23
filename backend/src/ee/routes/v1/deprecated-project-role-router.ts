import { packRules } from "@casl/ability/extra";
import { z } from "zod";

import { AccessScope, ProjectMembershipRole } from "@app/db/schemas/models";
import { ProjectRolesSchema } from "@app/db/schemas/project-roles";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  backfillPermissionV1SchemaToV2Schema,
  ProjectPermissionV1Schema
} from "@app/ee/services/permission/project-permission";
import { PROJECT_ROLE } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedRoleSchemaV1 } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerDeprecatedProjectRoleRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectSlug/roles",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Create a project role",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectSlug: z.string().trim().describe(PROJECT_ROLE.CREATE.projectSlug)
      }),
      body: z.object({
        slug: slugSchema({ max: 64 })
          .refine(
            (val) => !Object.values(ProjectMembershipRole).includes(val as ProjectMembershipRole),
            "Please choose a different slug, the slug you have entered is reserved"
          )
          .describe(PROJECT_ROLE.CREATE.slug),
        name: z.string().min(1).trim().describe(PROJECT_ROLE.CREATE.name),
        description: z.string().trim().nullish().describe(PROJECT_ROLE.CREATE.description),
        permissions: ProjectPermissionV1Schema.array().describe(PROJECT_ROLE.CREATE.permissions)
      }),
      response: {
        200: z.object({
          role: SanitizedRoleSchemaV1
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const stringifiedPermissions = JSON.stringify(
        packRules(backfillPermissionV1SchemaToV2Schema(req.body.permissions, true))
      );

      const { id: projectId } = await server.services.convertor.projectSlugToId({
        slug: req.params.projectSlug,
        orgId: req.permission.orgId
      });
      const role = await server.services.role.createRole({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId
        },
        data: {
          ...req.body,
          permissions: stringifiedPermissions
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
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

      return { role: { ...role, projectId: role.projectId as string } };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:projectSlug/roles/:roleId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Update a project role",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectSlug: z.string().trim().describe(PROJECT_ROLE.UPDATE.projectSlug),
        roleId: z.string().trim().describe(PROJECT_ROLE.UPDATE.roleId)
      }),
      body: z.object({
        slug: slugSchema({ max: 64 })
          .refine(
            (val) => !Object.values(ProjectMembershipRole).includes(val as ProjectMembershipRole),
            "Please choose a different slug, the slug you have entered is reserved"
          )
          .describe(PROJECT_ROLE.UPDATE.slug)
          .optional(),
        name: z.string().trim().optional().describe(PROJECT_ROLE.UPDATE.name),
        description: z.string().trim().nullish().describe(PROJECT_ROLE.UPDATE.description),
        permissions: ProjectPermissionV1Schema.array().describe(PROJECT_ROLE.UPDATE.permissions).optional()
      }),
      response: {
        200: z.object({
          role: SanitizedRoleSchemaV1
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const stringifiedPermissions = req.body.permissions
        ? JSON.stringify(packRules(backfillPermissionV1SchemaToV2Schema(req.body.permissions, true)))
        : undefined;

      const { id: projectId } = await server.services.convertor.projectSlugToId({
        slug: req.params.projectSlug,
        orgId: req.permission.orgId
      });

      const role = await server.services.role.updateRole({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId
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

      return { role: { ...role, projectId: role.projectId as string } };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectSlug/roles/:roleId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Delete a project role",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectSlug: z.string().trim().describe(PROJECT_ROLE.DELETE.projectSlug),
        roleId: z.string().trim().describe(PROJECT_ROLE.DELETE.roleId)
      }),
      response: {
        200: z.object({
          role: SanitizedRoleSchemaV1
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { id: projectId } = await server.services.convertor.projectSlugToId({
        slug: req.params.projectSlug,
        orgId: req.permission.orgId
      });

      const role = await server.services.role.deleteRole({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId
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

      return { role: { ...role, projectId: role.projectId as string } };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectSlug/roles",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List project role",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectSlug: z.string().trim().describe(PROJECT_ROLE.LIST.projectSlug)
      }),
      response: {
        200: z.object({
          roles: ProjectRolesSchema.omit({ permissions: true, version: true }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { id: projectId } = await server.services.convertor.projectSlugToId({
        slug: req.params.projectSlug,
        orgId: req.permission.orgId
      });

      const { roles } = await server.services.role.listRoles({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId
        },
        data: {}
      });
      return { roles: roles.map((el) => ({ ...el, projectId: el.projectId as string })) };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectSlug/roles/slug/:slug",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectSlug: z.string().trim().describe(PROJECT_ROLE.GET_ROLE_BY_SLUG.projectSlug),
        slug: z.string().trim().describe(PROJECT_ROLE.GET_ROLE_BY_SLUG.roleSlug)
      }),
      response: {
        200: z.object({
          role: SanitizedRoleSchemaV1
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { id: projectId } = await server.services.convertor.projectSlugToId({
        slug: req.params.projectSlug,
        orgId: req.permission.orgId
      });

      const role = await server.services.role.getRoleBySlug({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId
        },
        selector: {
          slug: req.params.slug
        }
      });

      return { role: { ...role, projectId: role.projectId as string } };
    }
  });
};
