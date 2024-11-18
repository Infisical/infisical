import { packRules } from "@casl/ability/extra";
import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { ProjectMembershipRole, ProjectRolesSchema } from "@app/db/schemas";
import { ProjectPermissionV2Schema } from "@app/ee/services/permission/project-permission";
import { PROJECT_ROLE } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedRoleSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";
import { ProjectRoleServiceIdentifierType } from "@app/services/project-role/project-role-types";

export const registerProjectRoleRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectId/roles",
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
        projectId: z.string().trim().describe(PROJECT_ROLE.CREATE.projectId)
      }),
      body: z.object({
        slug: z
          .string()
          .toLowerCase()
          .trim()
          .min(1)
          .refine(
            (val) => !Object.values(ProjectMembershipRole).includes(val as ProjectMembershipRole),
            "Please choose a different slug, the slug you have entered is reserved"
          )
          .refine((v) => slugify(v) === v, {
            message: "Slug must be a valid"
          })
          .describe(PROJECT_ROLE.CREATE.slug),
        name: z.string().min(1).trim().describe(PROJECT_ROLE.CREATE.name),
        description: z.string().trim().optional().describe(PROJECT_ROLE.CREATE.description),
        permissions: ProjectPermissionV2Schema.array().describe(PROJECT_ROLE.CREATE.permissions)
      }),
      response: {
        200: z.object({
          role: SanitizedRoleSchema
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
          type: ProjectRoleServiceIdentifierType.ID,
          projectId: req.params.projectId
        },
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
    url: "/:projectId/roles/:roleId",
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
        projectId: z.string().trim().describe(PROJECT_ROLE.UPDATE.projectId),
        roleId: z.string().trim().describe(PROJECT_ROLE.UPDATE.roleId)
      }),
      body: z.object({
        slug: z
          .string()
          .toLowerCase()
          .trim()
          .optional()
          .describe(PROJECT_ROLE.UPDATE.slug)
          .refine(
            (val) =>
              typeof val === "undefined" ||
              !Object.values(ProjectMembershipRole).includes(val as ProjectMembershipRole),
            "Please choose a different slug, the slug you have entered is reserved"
          )
          .refine((val) => typeof val === "undefined" || slugify(val) === val, {
            message: "Slug must be a valid"
          }),
        name: z.string().trim().optional().describe(PROJECT_ROLE.UPDATE.name),
        description: z.string().trim().optional().describe(PROJECT_ROLE.UPDATE.description),
        permissions: ProjectPermissionV2Schema.array().describe(PROJECT_ROLE.UPDATE.permissions).optional()
      }),
      response: {
        200: z.object({
          role: SanitizedRoleSchema
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
          permissions: req.body.permissions ? JSON.stringify(packRules(req.body.permissions)) : undefined
        }
      });
      return { role };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/roles/:roleId",
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
    url: "/:projectId/roles",
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
      const roles = await server.services.projectRole.listRoles({
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type,
        filter: {
          type: ProjectRoleServiceIdentifierType.ID,
          projectId: req.params.projectId
        }
      });
      return { roles };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/roles/slug/:roleSlug",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_ROLE.GET_ROLE_BY_SLUG.projectId),
        roleSlug: z.string().trim().describe(PROJECT_ROLE.GET_ROLE_BY_SLUG.roleSlug)
      }),
      response: {
        200: z.object({
          role: SanitizedRoleSchema.omit({ version: true })
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
          type: ProjectRoleServiceIdentifierType.ID,
          projectId: req.params.projectId
        },
        roleSlug: req.params.roleSlug
      });
      return { role };
    }
  });
};
