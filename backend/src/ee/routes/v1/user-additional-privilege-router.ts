import slugify from "@sindresorhus/slugify";
import ms from "ms";
import { z } from "zod";

import { ProjectUserAdditionalPrivilegeSchema } from "@app/db/schemas";
import { ProjectUserAdditionalPrivilegeTemporaryMode } from "@app/ee/services/project-user-additional-privilege/project-user-additional-privilege-types";
import { PROJECT_USER_ADDITIONAL_PRIVILEGE } from "@app/lib/api-docs";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerUserAdditionalPrivilegeRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/permanent",
    method: "POST",
    schema: {
      body: z.object({
        projectMembershipId: z.string().min(1).describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.CREATE.projectMembershipId),
        slug: z
          .string()
          .min(1)
          .max(60)
          .trim()
          .refine((v) => v.toLowerCase() === v, "Slug must be lowercase")
          .refine((v) => slugify(v) === v, {
            message: "Slug must be a valid slug"
          })
          .optional()
          .describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.CREATE.slug),
        permissions: z.any().array().describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.CREATE.permissions)
      }),
      response: {
        200: z.object({
          privilege: ProjectUserAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const privilege = await server.services.projectUserAdditionalPrivilege.create({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        slug: req.body.slug ? slugify(req.body.slug) : slugify(alphaNumericNanoId(12)),
        isTemporary: false,
        permissions: JSON.stringify(req.body.permissions)
      });
      return { privilege };
    }
  });

  server.route({
    url: "/temporary",
    method: "POST",
    schema: {
      body: z.object({
        projectMembershipId: z.string().min(1).describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.CREATE.projectMembershipId),
        slug: z
          .string()
          .min(1)
          .max(60)
          .trim()
          .refine((v) => v.toLowerCase() === v, "Slug must be lowercase")
          .refine((v) => slugify(v) === v, {
            message: "Slug must be a valid slug"
          })
          .optional()
          .describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.CREATE.slug),
        permissions: z.any().array().describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.CREATE.permissions),
        temporaryMode: z
          .nativeEnum(ProjectUserAdditionalPrivilegeTemporaryMode)
          .describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.CREATE.temporaryMode),
        temporaryRange: z
          .string()
          .refine((val) => ms(val) > 0, "Temporary range must be a positive number")
          .describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.CREATE.temporaryRange),
        temporaryAccessStartTime: z
          .string()
          .datetime()
          .describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.CREATE.temporaryAccessStartTime)
      }),
      response: {
        200: z.object({
          privilege: ProjectUserAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const privilege = await server.services.projectUserAdditionalPrivilege.create({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        slug: req.body.slug ? slugify(req.body.slug) : `privilege-${slugify(alphaNumericNanoId(12))}`,
        isTemporary: true,
        permissions: JSON.stringify(req.body.permissions)
      });
      return { privilege };
    }
  });

  server.route({
    url: "/:privilegeId",
    method: "PATCH",
    schema: {
      params: z.object({
        privilegeId: z.string().min(1).describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.UPDATE.privilegeId)
      }),
      body: z
        .object({
          slug: z
            .string()
            .max(60)
            .trim()
            .refine((v) => v.toLowerCase() === v, "Slug must be lowercase")
            .refine((v) => slugify(v) === v, {
              message: "Slug must be a valid slug"
            })
            .describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.UPDATE.slug),
          permissions: z.any().array().describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.UPDATE.permissions),
          isTemporary: z.boolean().describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.UPDATE.isTemporary),
          temporaryMode: z
            .nativeEnum(ProjectUserAdditionalPrivilegeTemporaryMode)
            .describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.UPDATE.temporaryMode),
          temporaryRange: z
            .string()
            .refine((val) => ms(val) > 0, "Temporary range must be a positive number")
            .describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.UPDATE.temporaryRange),
          temporaryAccessStartTime: z
            .string()
            .datetime()
            .describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.UPDATE.temporaryAccessStartTime)
        })
        .partial(),
      response: {
        200: z.object({
          privilege: ProjectUserAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const privilege = await server.services.projectUserAdditionalPrivilege.updateById({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        permissions: req.body.permissions ? JSON.stringify(req.body.permissions) : undefined,
        privilegeId: req.params.privilegeId
      });
      return { privilege };
    }
  });

  server.route({
    url: "/:privilegeId",
    method: "DELETE",
    schema: {
      params: z.object({
        privilegeId: z.string().describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.DELETE.privilegeId)
      }),
      response: {
        200: z.object({
          privilege: ProjectUserAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const privilege = await server.services.projectUserAdditionalPrivilege.deleteById({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        privilegeId: req.params.privilegeId
      });
      return { privilege };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    schema: {
      querystring: z.object({
        projectMembershipId: z.string().describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.LIST.projectMembershipId)
      }),
      response: {
        200: z.object({
          privileges: ProjectUserAdditionalPrivilegeSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const privileges = await server.services.projectUserAdditionalPrivilege.listPrivileges({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        projectMembershipId: req.query.projectMembershipId
      });
      return { privileges };
    }
  });

  server.route({
    url: "/:privilegeId",
    method: "GET",
    schema: {
      params: z.object({
        privilegeId: z.string().describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.GET_BY_PRIVILEGEID.privilegeId)
      }),
      response: {
        200: z.object({
          privilege: ProjectUserAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const privilege = await server.services.projectUserAdditionalPrivilege.getPrivilegeDetailsById({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        privilegeId: req.params.privilegeId
      });
      return { privilege };
    }
  });
};
