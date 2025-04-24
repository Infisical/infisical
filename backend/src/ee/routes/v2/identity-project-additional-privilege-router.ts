import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { IdentityProjectAdditionalPrivilegeTemporaryMode } from "@app/ee/services/identity-project-additional-privilege-v2/identity-project-additional-privilege-v2-types";
import { checkForInvalidPermissionCombination } from "@app/ee/services/permission/permission-fns";
import { ProjectPermissionV2Schema } from "@app/ee/services/permission/project-permission";
import { ApiDocsTags, IDENTITY_ADDITIONAL_PRIVILEGE_V2 } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedIdentityPrivilegeSchema } from "@app/server/routes/sanitizedSchema/identitiy-additional-privilege";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerIdentityProjectAdditionalPrivilegeRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentitySpecificPrivilegesV2],
      description: "Add an additional privilege for identity.",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        identityId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.CREATE.identityId),
        projectId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.CREATE.projectId),
        slug: slugSchema({ min: 1, max: 60 }).optional().describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.CREATE.slug),
        permissions: ProjectPermissionV2Schema.array()
          .describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.CREATE.permission)
          .refine(checkForInvalidPermissionCombination),
        type: z.discriminatedUnion("isTemporary", [
          z.object({
            isTemporary: z.literal(false)
          }),
          z.object({
            isTemporary: z.literal(true),
            temporaryMode: z
              .nativeEnum(IdentityProjectAdditionalPrivilegeTemporaryMode)
              .describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.CREATE.temporaryMode),
            temporaryRange: z
              .string()
              .refine((val) => ms(val) > 0, "Temporary range must be a positive number")
              .describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.CREATE.temporaryRange),
            temporaryAccessStartTime: z
              .string()
              .datetime()
              .describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.CREATE.temporaryAccessStartTime)
          })
        ])
      }),
      response: {
        200: z.object({
          privilege: SanitizedIdentityPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const privilege = await server.services.identityProjectAdditionalPrivilegeV2.create({
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actor: req.permission.type,
        projectId: req.body.projectId,
        identityId: req.body.identityId,
        ...req.body.type,
        slug: req.body.slug || slugify(alphaNumericNanoId(8)),
        permissions: req.body.permissions
      });
      return { privilege };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentitySpecificPrivilegesV2],
      description: "Update a specific identity privilege.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        id: z.string().trim().describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.UPDATE.id)
      }),
      body: z.object({
        slug: slugSchema({ min: 1, max: 60 }).describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.UPDATE.slug),
        permissions: ProjectPermissionV2Schema.array()
          .optional()
          .describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.UPDATE.privilegePermission)
          .refine(checkForInvalidPermissionCombination),
        type: z.discriminatedUnion("isTemporary", [
          z.object({ isTemporary: z.literal(false).describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.UPDATE.isTemporary) }),
          z.object({
            isTemporary: z.literal(true).describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.UPDATE.isTemporary),
            temporaryMode: z
              .nativeEnum(IdentityProjectAdditionalPrivilegeTemporaryMode)
              .describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.UPDATE.temporaryMode),
            temporaryRange: z
              .string()
              .refine((val) => typeof val === "undefined" || ms(val) > 0, "Temporary range must be a positive number")
              .describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.UPDATE.temporaryRange),
            temporaryAccessStartTime: z
              .string()
              .datetime()
              .describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.UPDATE.temporaryAccessStartTime)
          })
        ])
      }),
      response: {
        200: z.object({
          privilege: SanitizedIdentityPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const privilege = await server.services.identityProjectAdditionalPrivilegeV2.updateById({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        id: req.params.id,
        data: {
          ...req.body,
          ...req.body.type,
          permissions: req.body.permissions || undefined
        }
      });
      return { privilege };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentitySpecificPrivilegesV2],
      description: "Delete the specified identity privilege.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        id: z.string().trim().describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.DELETE.id)
      }),
      response: {
        200: z.object({
          privilege: SanitizedIdentityPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const privilege = await server.services.identityProjectAdditionalPrivilegeV2.deleteById({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.id
      });
      return { privilege };
    }
  });

  server.route({
    method: "GET",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentitySpecificPrivilegesV2],
      description: "Retrieve details of a specific privilege by id.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        id: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.GET_BY_ID.id)
      }),
      response: {
        200: z.object({
          privilege: SanitizedIdentityPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const privilege = await server.services.identityProjectAdditionalPrivilegeV2.getPrivilegeDetailsById({
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        id: req.params.id
      });
      return { privilege };
    }
  });

  server.route({
    method: "GET",
    url: "/slug/:privilegeSlug",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentitySpecificPrivilegesV2],
      description: "Retrieve details of a specific privilege by slug.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        privilegeSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.GET_BY_SLUG.slug)
      }),
      querystring: z.object({
        identityId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.GET_BY_SLUG.identityId),
        projectSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.GET_BY_SLUG.projectSlug)
      }),
      response: {
        200: z.object({
          privilege: SanitizedIdentityPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const privilege = await server.services.identityProjectAdditionalPrivilegeV2.getPrivilegeDetailsBySlug({
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        slug: req.params.privilegeSlug,
        ...req.query
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
      hide: false,
      tags: [ApiDocsTags.IdentitySpecificPrivilegesV2],
      description: "List privileges for the specified identity by project.",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        identityId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.LIST.identityId),
        projectId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE_V2.LIST.projectId)
      }),
      response: {
        200: z.object({
          privileges: SanitizedIdentityPrivilegeSchema.omit({ permissions: true }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const privileges = await server.services.identityProjectAdditionalPrivilegeV2.listIdentityProjectPrivileges({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });
      return {
        privileges
      };
    }
  });
};
