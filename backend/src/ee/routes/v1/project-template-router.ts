import { z } from "zod";

import { ProjectMembershipRole, ProjectTemplatesSchema, ProjectType } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ProjectPermissionV2Schema } from "@app/ee/services/permission/project-permission";
import { isInfisicalProjectTemplate } from "@app/ee/services/project-template/project-template-fns";
import { ApiDocsTags, ProjectTemplates } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { UnpackedPermissionSchema } from "@app/server/routes/sanitizedSchema/permission";
import { AuthMode } from "@app/services/auth/auth-type";

const MAX_JSON_SIZE_LIMIT_IN_BYTES = 32_768;

const isReservedRoleSlug = (slug: string) =>
  Object.values(ProjectMembershipRole).includes(slug as ProjectMembershipRole);

const isReservedRoleName = (name: string) =>
  ["custom", "admin", "viewer", "developer", "no access"].includes(name.toLowerCase());

const SanitizedProjectTemplateSchema = ProjectTemplatesSchema.extend({
  roles: z
    .object({
      name: z.string().trim().min(1),
      slug: slugSchema(),
      permissions: UnpackedPermissionSchema.array()
    })
    .array(),
  environments: z
    .object({
      name: z.string().trim().min(1),
      slug: slugSchema(),
      position: z.number().min(1)
    })
    .array()
    .nullable(),
  users: z
    .object({
      username: z.string().trim().min(1),
      roles: z.string().array()
    })
    .array()
    .nullable()
});

const ProjectTemplateRolesSchema = z
  .object({
    name: z.string().trim().min(1),
    slug: slugSchema(),
    permissions: ProjectPermissionV2Schema.array()
  })
  .array()
  .superRefine((roles, ctx) => {
    if (!roles.length) return;

    if (Buffer.byteLength(JSON.stringify(roles)) > MAX_JSON_SIZE_LIMIT_IN_BYTES)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Size limit exceeded" });

    if (new Set(roles.map((v) => v.slug)).size !== roles.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Role slugs must be unique" });

    if (new Set(roles.map((v) => v.name)).size !== roles.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Role names must be unique" });

    roles.forEach((role) => {
      if (isReservedRoleSlug(role.slug))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Role slug "${role.slug}" is reserved` });

      if (isReservedRoleName(role.name))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Role name "${role.name}" is reserved` });
    });
  });

const ProjectTemplateEnvironmentsSchema = z
  .object({
    name: z.string().trim().min(1),
    slug: slugSchema(),
    position: z.number().min(1)
  })
  .array()
  .superRefine((environments, ctx) => {
    if (Buffer.byteLength(JSON.stringify(environments)) > MAX_JSON_SIZE_LIMIT_IN_BYTES)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Size limit exceeded" });

    if (new Set(environments.map((v) => v.name)).size !== environments.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Environment names must be unique" });

    if (new Set(environments.map((v) => v.slug)).size !== environments.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Environment slugs must be unique" });

    if (
      environments.some((env) => env.position < 1 || env.position > environments.length) ||
      new Set(environments.map((env) => env.position)).size !== environments.length
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "One or more of the positions specified is invalid. Positions must be sequential starting from 1."
      });
  });

const predefinedRoleSlugs = Object.values(ProjectMembershipRole);

const ProjectTemplateUsersSchema = z
  .object({
    username: z.string().trim().min(1).toLowerCase(),
    roles: z.string().trim().min(1).array().min(1)
  })
  .array()
  .superRefine((users, ctx) => {
    if (!users.length) return;

    if (Buffer.byteLength(JSON.stringify(users)) > MAX_JSON_SIZE_LIMIT_IN_BYTES)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Size limit exceeded" });

    if (new Set(users.map((v) => v.username)).size !== users.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Usernames must be unique" });
  });

// Helper to validate user roles against available template roles
const validateUserRoles = (
  users: { username: string; roles: string[] }[] | undefined,
  templateRoles: { slug: string }[] | undefined,
  ctx: z.RefinementCtx
) => {
  if (!users?.length) return;

  const availableRoleSlugs = new Set([...predefinedRoleSlugs, ...(templateRoles?.map((r) => r.slug) ?? [])]);

  users.forEach((user) => {
    user.roles.forEach((roleSlug) => {
      if (!availableRoleSlugs.has(roleSlug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `User "${user.username}" references invalid role slug "${roleSlug}". Role must be a predefined role or defined in the template roles.`
        });
      }
    });
  });
};

export const registerProjectTemplateRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectTemplates],
      description: "List project templates for the current organization.",
      querystring: z.object({
        type: z.nativeEnum(ProjectType).optional().describe(ProjectTemplates.LIST.type)
      }),
      response: {
        200: z.object({
          projectTemplates: SanitizedProjectTemplateSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectTemplates = await server.services.projectTemplate.listProjectTemplatesByOrg(
        req.permission,
        req.query.type
      );

      const auditTemplates = projectTemplates.filter((template) => !isInfisicalProjectTemplate(template.name));

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GET_PROJECT_TEMPLATES,
          metadata: {
            count: auditTemplates.length,
            templateIds: auditTemplates.map((template) => template.id)
          }
        }
      });

      return { projectTemplates };
    }
  });

  server.route({
    method: "GET",
    url: "/:templateId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectTemplates],
      description: "Get a project template by ID.",
      params: z.object({
        templateId: z.string().uuid()
      }),
      response: {
        200: z.object({
          projectTemplate: SanitizedProjectTemplateSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectTemplate = await server.services.projectTemplate.findProjectTemplateById(
        req.params.templateId,
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GET_PROJECT_TEMPLATE,
          metadata: {
            templateId: req.params.templateId
          }
        }
      });

      return { projectTemplate };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectTemplates],
      description: "Create a project template.",
      body: z
        .object({
          name: slugSchema({ field: "name" })
            .refine((val) => !isInfisicalProjectTemplate(val), {
              message: `The requested project template name is reserved.`
            })
            .describe(ProjectTemplates.CREATE.name),
          description: z.string().max(256).trim().optional().describe(ProjectTemplates.CREATE.description),
          roles: ProjectTemplateRolesSchema.default([]).describe(ProjectTemplates.CREATE.roles),
          type: z.nativeEnum(ProjectType).describe(ProjectTemplates.CREATE.type),
          environments: ProjectTemplateEnvironmentsSchema.nullish().describe(ProjectTemplates.CREATE.environments),
          users: ProjectTemplateUsersSchema.default([]).describe(ProjectTemplates.CREATE.users)
        })
        .superRefine((data, ctx) => {
          validateUserRoles(data.users, data.roles, ctx);
        }),
      response: {
        200: z.object({
          projectTemplate: SanitizedProjectTemplateSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectTemplate = await server.services.projectTemplate.createProjectTemplate(req.body, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.CREATE_PROJECT_TEMPLATE,
          metadata: req.body
        }
      });

      return { projectTemplate };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:templateId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectTemplates],
      description: "Update a project template.",
      params: z.object({ templateId: z.string().uuid().describe(ProjectTemplates.UPDATE.templateId) }),
      body: z
        .object({
          name: slugSchema({ field: "name" })
            .refine((val) => !isInfisicalProjectTemplate(val), {
              message: `The requested project template name is reserved.`
            })
            .optional()
            .describe(ProjectTemplates.UPDATE.name),
          description: z.string().max(256).trim().optional().describe(ProjectTemplates.UPDATE.description),
          roles: ProjectTemplateRolesSchema.optional().describe(ProjectTemplates.UPDATE.roles),
          environments: ProjectTemplateEnvironmentsSchema.nullish().describe(ProjectTemplates.UPDATE.environments),
          users: ProjectTemplateUsersSchema.nullish().describe(ProjectTemplates.UPDATE.users)
        })
        .superRefine((data, ctx) => {
          // Note: For updates, if users are provided but roles are not, validation against existing template roles
          // will happen in the service layer after fetching the template
          if (data.users && data.roles) {
            validateUserRoles(data.users, data.roles, ctx);
          }
        }),
      response: {
        200: z.object({
          projectTemplate: SanitizedProjectTemplateSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectTemplate = await server.services.projectTemplate.updateProjectTemplateById(
        req.params.templateId,
        req.body,
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.UPDATE_PROJECT_TEMPLATE,
          metadata: {
            templateId: req.params.templateId,
            ...req.body
          }
        }
      });

      return { projectTemplate };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:templateId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectTemplates],
      description: "Delete a project template.",
      params: z.object({ templateId: z.string().uuid().describe(ProjectTemplates.DELETE.templateId) }),
      response: {
        200: z.object({
          projectTemplate: SanitizedProjectTemplateSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectTemplate = await server.services.projectTemplate.deleteProjectTemplateById(
        req.params.templateId,
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.DELETE_PROJECT_TEMPLATE,
          metadata: {
            templateId: req.params.templateId
          }
        }
      });

      return { projectTemplate };
    }
  });
};
