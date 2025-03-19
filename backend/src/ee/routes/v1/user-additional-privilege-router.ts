import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { checkForInvalidPermissionCombination } from "@app/ee/services/permission/permission-fns";
import { ProjectPermissionV2Schema } from "@app/ee/services/permission/project-permission";
import { ProjectUserAdditionalPrivilegeTemporaryMode } from "@app/ee/services/project-user-additional-privilege/project-user-additional-privilege-types";
import { PROJECT_USER_ADDITIONAL_PRIVILEGE } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedUserProjectAdditionalPrivilegeSchema } from "@app/server/routes/sanitizedSchema/user-additional-privilege";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerUserAdditionalPrivilegeRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        projectMembershipId: z.string().min(1).describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.CREATE.projectMembershipId),
        slug: slugSchema({ min: 1, max: 60 }).optional().describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.CREATE.slug),
        permissions: ProjectPermissionV2Schema.array()
          .describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.CREATE.permissions)
          .refine(checkForInvalidPermissionCombination),
        type: z.discriminatedUnion("isTemporary", [
          z.object({
            isTemporary: z.literal(false)
          }),
          z.object({
            isTemporary: z.literal(true),
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
          })
        ])
      }),
      response: {
        200: z.object({
          privilege: SanitizedUserProjectAdditionalPrivilegeSchema
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
        projectMembershipId: req.body.projectMembershipId,
        ...req.body.type,
        slug: req.body.slug || slugify(alphaNumericNanoId(8)),
        permissions: req.body.permissions
      });
      return { privilege };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:privilegeId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        privilegeId: z.string().min(1).describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.UPDATE.privilegeId)
      }),
      body: z
        .object({
          slug: slugSchema({ min: 1, max: 60 }).describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.UPDATE.slug),
          permissions: ProjectPermissionV2Schema.array()
            .optional()
            .describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.UPDATE.permissions)
            .refine(checkForInvalidPermissionCombination),
          type: z.discriminatedUnion("isTemporary", [
            z.object({ isTemporary: z.literal(false).describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.UPDATE.isTemporary) }),
            z.object({
              isTemporary: z.literal(true).describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.UPDATE.isTemporary),
              temporaryMode: z
                .nativeEnum(ProjectUserAdditionalPrivilegeTemporaryMode)
                .describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.UPDATE.temporaryMode),
              temporaryRange: z
                .string()
                .refine((val) => typeof val === "undefined" || ms(val) > 0, "Temporary range must be a positive number")
                .describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.UPDATE.temporaryRange),
              temporaryAccessStartTime: z
                .string()
                .datetime()
                .describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.UPDATE.temporaryAccessStartTime)
            })
          ])
        })
        .partial(),
      response: {
        200: z.object({
          privilege: SanitizedUserProjectAdditionalPrivilegeSchema
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
        ...req.body.type,
        permissions: req.body.permissions
          ? // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore-error this is valid ts
            req.body.permissions
          : undefined,
        privilegeId: req.params.privilegeId
      });
      return { privilege };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:privilegeId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        privilegeId: z.string().describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.DELETE.privilegeId)
      }),
      response: {
        200: z.object({
          privilege: SanitizedUserProjectAdditionalPrivilegeSchema
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
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        projectMembershipId: z.string().describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.LIST.projectMembershipId)
      }),
      response: {
        200: z.object({
          privileges: SanitizedUserProjectAdditionalPrivilegeSchema.omit({ permissions: true }).array()
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
    method: "GET",
    url: "/:privilegeId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        privilegeId: z.string().describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.GET_BY_PRIVILEGE_ID.privilegeId)
      }),
      response: {
        200: z.object({
          privilege: SanitizedUserProjectAdditionalPrivilegeSchema
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
