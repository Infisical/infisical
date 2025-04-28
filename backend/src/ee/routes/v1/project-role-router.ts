import { packRules } from "@casl/ability/extra";
import { z } from "zod";

import { ProjectMembershipRole, ProjectRolesSchema } from "@app/db/schemas";
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
import { ProjectRoleServiceIdentifierType } from "@app/services/project-role/project-role-types";

export const registerProjectRoleRouter = async (server: FastifyZodProvider) => {
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
      const role = await server.services.projectRole.createRole({
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type,
        filter: {
          type: ProjectRoleServiceIdentifierType.SLUG,
          projectSlug: req.params.projectSlug
        },
        data: {
          ...req.body,
          permissions: JSON.stringify(packRules(backfillPermissionV1SchemaToV2Schema(req.body.permissions, true)))
        }
      });

      return { role };
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
      const role = await server.services.projectRole.updateRole({
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type,
        roleId: req.params.roleId,
        data: {
          ...req.body,
          permissions: req.body.permissions
            ? JSON.stringify(packRules(backfillPermissionV1SchemaToV2Schema(req.body.permissions, true)))
            : undefined
        }
      });
      return { role };
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
      const role = await server.services.projectRole.deleteRole({
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
      const roles = await server.services.projectRole.listRoles({
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type,
        filter: {
          type: ProjectRoleServiceIdentifierType.SLUG,
          projectSlug: req.params.projectSlug
        }
      });
      return { roles };
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
          role: SanitizedRoleSchemaV1.omit({ version: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const role = await server.services.projectRole.getRoleBySlug({
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type,
        filter: {
          type: ProjectRoleServiceIdentifierType.SLUG,
          projectSlug: req.params.projectSlug
        },
        roleSlug: req.params.slug
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
            membership: z.object({
              id: z.string(),
              roles: z
                .object({
                  role: z.string()
                })
                .array()
            }),
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
      const { permissions, membership, assumedPrivilegeDetails } = await server.services.projectRole.getUserPermission(
        req.permission.id,
        req.params.projectId,
        req.permission.authMethod,
        req.permission.orgId
      );

      return {
        data: {
          permissions,
          membership,
          assumedPrivilegeDetails
        }
      };
    }
  });
};
