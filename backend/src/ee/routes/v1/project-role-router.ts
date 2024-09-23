import { packRules } from "@casl/ability/extra";
import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { ProjectMembershipRole, ProjectMembershipsSchema, ProjectRolesSchema } from "@app/db/schemas";
import { PROJECT_ROLE } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ProjectPermissionSchema, SanitizedRoleSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

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
        permissions: ProjectPermissionSchema.array().describe(PROJECT_ROLE.CREATE.permissions)
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
        projectSlug: req.params.projectSlug,
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
        permissions: ProjectPermissionSchema.array().describe(PROJECT_ROLE.UPDATE.permissions).optional()
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
        projectSlug: req.params.projectSlug,
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
        projectSlug: req.params.projectSlug,
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
          roles: ProjectRolesSchema.omit({ permissions: true }).array()
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
        projectSlug: req.params.projectSlug
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
          role: SanitizedRoleSchema
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
        projectSlug: req.params.projectSlug,
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
            membership: ProjectMembershipsSchema.extend({
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
      const { permissions, membership } = await server.services.projectRole.getUserPermission(
        req.permission.id,
        req.params.projectId,
        req.permission.authMethod,
        req.permission.orgId
      );

      return { data: { permissions, membership } };
    }
  });
};
