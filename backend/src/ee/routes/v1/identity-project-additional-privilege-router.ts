import { MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, packRules, unpackRules } from "@casl/ability/extra";
import slugify from "@sindresorhus/slugify";
import ms from "ms";
import { z } from "zod";

import { IdentityProjectAdditionalPrivilegeSchema } from "@app/db/schemas";
import { IdentityProjectAdditionalPrivilegeTemporaryMode } from "@app/ee/services/identity-project-additional-privilege/identity-project-additional-privilege-types";
import { ProjectPermissionSet } from "@app/ee/services/permission/project-permission";
import { IDENTITY_ADDITIONAL_PRIVILEGE } from "@app/lib/api-docs";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerIdentityProjectAdditionalPrivilegeRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/permanent",
    method: "POST",
    schema: {
      body: z.object({
        identityId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.identityId),
        projectSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.projectSlug),
        slug: z
          .string()
          .min(1)
          .max(60)
          .trim()
          .default(slugify(alphaNumericNanoId(12)))
          .refine((val) => val.toLowerCase() === val, "Must be lowercase")
          .refine((v) => slugify(v) === v, {
            message: "Slug must be a valid slug"
          })
          .describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.slug),
        permissions: z.any().array().describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.permissions)
      }),
      response: {
        200: z.object({
          privilege: IdentityProjectAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const privilege = await server.services.identityProjectAdditionalPrivilege.create({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        isTemporary: false,
        permissions: JSON.stringify(packRules(req.body.permissions))
      });
      return { privilege };
    }
  });

  server.route({
    url: "/temporary",
    method: "POST",
    schema: {
      body: z.object({
        identityId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.identityId),
        projectSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.projectSlug),
        slug: z
          .string()
          .min(1)
          .max(60)
          .trim()
          .default(slugify(alphaNumericNanoId(12)))
          .refine((val) => val.toLowerCase() === val, "Must be lowercase")
          .refine((v) => slugify(v) === v, {
            message: "Slug must be a valid slug"
          })
          .describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.slug),
        permissions: z.any().array().describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.permissions),
        temporaryMode: z
          .nativeEnum(IdentityProjectAdditionalPrivilegeTemporaryMode)
          .describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.temporaryMode),
        temporaryRange: z
          .string()
          .refine((val) => ms(val) > 0, "Temporary range must be a positive number")
          .describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.temporaryRange),
        temporaryAccessStartTime: z
          .string()
          .datetime()
          .describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.temporaryAccessStartTime)
      }),
      response: {
        200: z.object({
          privilege: IdentityProjectAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const privilege = await server.services.identityProjectAdditionalPrivilege.create({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        isTemporary: true,
        permissions: JSON.stringify(packRules(req.body.permissions))
      });
      return { privilege };
    }
  });

  server.route({
    url: "/",
    method: "PATCH",
    schema: {
      body: z.object({
        // disallow empty string
        privilegeSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.UPDATE.slug),
        identityId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.UPDATE.identityId),
        projectSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.UPDATE.projectSlug),
        privilegeDetails: z
          .object({
            slug: z
              .string()
              .min(1)
              .max(60)
              .trim()
              .refine((val) => val.toLowerCase() === val, "Must be lowercase")
              .refine((v) => slugify(v) === v, {
                message: "Slug must be a valid slug"
              })
              .describe(IDENTITY_ADDITIONAL_PRIVILEGE.UPDATE.newSlug),
            permissions: z.any().array().describe(IDENTITY_ADDITIONAL_PRIVILEGE.UPDATE.permissions),
            isTemporary: z.boolean().describe(IDENTITY_ADDITIONAL_PRIVILEGE.UPDATE.isTemporary),
            temporaryMode: z
              .nativeEnum(IdentityProjectAdditionalPrivilegeTemporaryMode)
              .describe(IDENTITY_ADDITIONAL_PRIVILEGE.UPDATE.temporaryMode),
            temporaryRange: z
              .string()
              .refine((val) => ms(val) > 0, "Temporary range must be a positive number")
              .describe(IDENTITY_ADDITIONAL_PRIVILEGE.UPDATE.temporaryRange),
            temporaryAccessStartTime: z
              .string()
              .datetime()
              .describe(IDENTITY_ADDITIONAL_PRIVILEGE.UPDATE.temporaryAccessStartTime)
          })
          .partial()
      }),
      response: {
        200: z.object({
          privilege: IdentityProjectAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const updatedInfo = req.body.privilegeDetails;
      const privilege = await server.services.identityProjectAdditionalPrivilege.updateBySlug({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        slug: req.body.privilegeSlug,
        identityId: req.body.identityId,
        projectSlug: req.body.projectSlug,
        data: {
          ...updatedInfo,
          permissions: updatedInfo?.permissions ? JSON.stringify(packRules(updatedInfo.permissions)) : undefined
        }
      });
      return { privilege };
    }
  });

  server.route({
    url: "/",
    method: "DELETE",
    schema: {
      body: z.object({
        privilegeSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.DELETE.slug),
        identityId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.DELETE.identityId),
        projectSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.DELETE.projectSlug)
      }),
      response: {
        200: z.object({
          privilege: IdentityProjectAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const privilege = await server.services.identityProjectAdditionalPrivilege.deleteBySlug({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        slug: req.body.privilegeSlug,
        identityId: req.body.identityId,
        projectSlug: req.body.projectSlug
      });
      return { privilege };
    }
  });

  server.route({
    url: "/:privilegeSlug",
    method: "GET",
    schema: {
      params: z.object({
        privilegeSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.GET_BY_SLUG.slug)
      }),
      querystring: z.object({
        identityId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.GET_BY_SLUG.identityId),
        projectSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.GET_BY_SLUG.projectSlug)
      }),
      response: {
        200: z.object({
          privilege: IdentityProjectAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const privilege = await server.services.identityProjectAdditionalPrivilege.getPrivilegeDetailsBySlug({
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
    url: "/",
    method: "GET",
    schema: {
      querystring: z.object({
        identityId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.LIST.identityId),
        projectSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.LIST.projectSlug),
        unpacked: z
          .enum(["false", "true"])
          .transform((el) => el === "true")
          .default("true")
          .describe(IDENTITY_ADDITIONAL_PRIVILEGE.LIST.unpacked)
      }),
      response: {
        200: z.object({
          privileges: IdentityProjectAdditionalPrivilegeSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const privileges = await server.services.identityProjectAdditionalPrivilege.listIdentityProjectPrivileges({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });
      if (req.query.unpacked) {
        return {
          privileges: privileges.map(({ permissions, ...el }) => ({
            ...el,
            permissions: unpackRules(permissions as PackRule<RawRuleOf<MongoAbility<ProjectPermissionSet>>>[])
          }))
        };
      }
      return { privileges };
    }
  });
};
