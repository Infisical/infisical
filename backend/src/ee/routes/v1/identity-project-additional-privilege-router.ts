import { MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, packRules, unpackRules } from "@casl/ability/extra";
import slugify from "@sindresorhus/slugify";
import ms from "ms";
import { z } from "zod";

import { IdentityProjectAdditionalPrivilegeSchema } from "@app/db/schemas";
import { IdentityProjectAdditionalPrivilegeTemporaryMode } from "@app/ee/services/identity-project-additional-privilege/identity-project-additional-privilege-types";
import { ProjectPermissionSet } from "@app/ee/services/permission/project-permission";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerIdentityProjectAdditionalPrivilegeRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    schema: {
      body: z.union([
        z.object({
          identityId: z.string().min(1),
          projectSlug: z.string().min(1),
          slug: z
            .string()
            .min(1)
            .max(60)
            .trim()
            .optional()
            .default(`privilege-${slugify(alphaNumericNanoId(12))}`)
            .refine((v) => slugify(v) === v, {
              message: "Slug must be a valid slug"
            }),
          permissions: z.any().array(),
          isPackedPermission: z.boolean().optional().default(false),
          isTemporary: z.literal(false).default(false)
        }),
        z.object({
          identityId: z.string(),
          projectSlug: z.string().min(1),
          slug: z
            .string()
            .min(1)
            .max(60)
            .trim()
            .optional()
            .default(`privilege-${slugify(alphaNumericNanoId(12))}`)
            .refine((v) => slugify(v) === v, {
              message: "Slug must be a valid slug"
            }),
          permissions: z.any().array(),
          isTemporary: z.literal(true),
          isPackedPermission: z.boolean().optional().default(false),
          temporaryMode: z.nativeEnum(IdentityProjectAdditionalPrivilegeTemporaryMode),
          temporaryRange: z.string().refine((val) => ms(val) > 0, "Temporary range must be a positive number"),
          temporaryAccessStartTime: z.string().datetime()
        })
      ]),
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
        permissions: JSON.stringify(
          req.body.isPackedPermission ? req.body.permissions : packRules(req.body.permissions)
        )
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
        slug: z.string().min(1),
        identityId: z.string().min(1),
        projectSlug: z.string().min(1),
        data: z
          .object({
            slug: z
              .string()
              .min(1)
              .max(60)
              .trim()
              .refine((v) => slugify(v) === v, {
                message: "Slug must be a valid slug"
              }),
            isPackedPermission: z.boolean().optional().default(false),
            permissions: z.any().array(),
            isTemporary: z.boolean(),
            temporaryMode: z.nativeEnum(IdentityProjectAdditionalPrivilegeTemporaryMode),
            temporaryRange: z.string().refine((val) => ms(val) > 0, "Temporary range must be a positive number"),
            temporaryAccessStartTime: z.string().datetime()
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
      const { isPackedPermission, ...data } = req.body.data;
      const privilege = await server.services.identityProjectAdditionalPrivilege.updateBySlug({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        data: {
          ...data,
          permissions: data?.permissions
            ? JSON.stringify(isPackedPermission ? data?.permissions : packRules(data.permissions))
            : undefined
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
        slug: z.string().min(1),
        identityId: z.string().min(1),
        projectSlug: z.string().min(1)
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
        ...req.body
      });
      return { privilege };
    }
  });

  server.route({
    url: "/:slug",
    method: "GET",
    schema: {
      params: z.object({
        slug: z.string()
      }),
      querystring: z.object({
        identityId: z.string().min(1),
        projectSlug: z.string().min(1)
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
        slug: req.params.slug,
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
        identityId: z.string().min(1),
        projectSlug: z.string().min(1),
        unpacked: z
          .enum(["false", "true"])
          .transform((el) => el === "true")
          .default("true")
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
