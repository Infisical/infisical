import { packRules } from "@casl/ability/extra";
import slugify from "@sindresorhus/slugify";
import ms from "ms";
import { z } from "zod";

import { IdentityProjectAdditionalPrivilegeTemporaryMode } from "@app/ee/services/identity-project-additional-privilege/identity-project-additional-privilege-types";
import { IDENTITY_ADDITIONAL_PRIVILEGE } from "@app/lib/api-docs";
import { UnauthorizedError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import {
  ProjectPermissionSchema,
  ProjectSpecificPrivilegePermissionSchema,
  SanitizedIdentityPrivilegeSchema
} from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerIdentityProjectAdditionalPrivilegeRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/permanent",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Create a permanent or a non expiry specific privilege for identity.",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        identityId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.identityId),
        projectSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.projectSlug),
        slug: z
          .string()
          .min(1)
          .max(60)
          .trim()
          .refine((val) => val.toLowerCase() === val, "Must be lowercase")
          .refine((v) => slugify(v) === v, {
            message: "Slug must be a valid slug"
          })
          .optional()
          .describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.slug),
        permissions: ProjectPermissionSchema.array()
          .describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.permissions)
          .optional(),
        privilegePermission: ProjectSpecificPrivilegePermissionSchema.describe(
          IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.privilegePermission
        ).optional()
      }),
      response: {
        200: z.object({
          privilege: SanitizedIdentityPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { permissions, privilegePermission } = req.body;
      if (!permissions && !privilegePermission) {
        throw new UnauthorizedError({ message: "Permission or privilegePermission must be provided" });
      }

      const permission = privilegePermission
        ? privilegePermission.actions.map((action) => ({
            action,
            subject: privilegePermission.subject,
            conditions: privilegePermission.conditions
          }))
        : permissions!;
      const privilege = await server.services.identityProjectAdditionalPrivilege.create({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        slug: req.body.slug ? slugify(req.body.slug) : slugify(alphaNumericNanoId(12)),
        isTemporary: false,
        permissions: JSON.stringify(packRules(permission))
      });
      return { privilege };
    }
  });

  server.route({
    method: "POST",
    url: "/temporary",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Create a temporary or a expiring specific privilege for identity.",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        identityId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.identityId),
        projectSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.projectSlug),
        slug: z
          .string()
          .min(1)
          .max(60)
          .trim()
          .refine((val) => val.toLowerCase() === val, "Must be lowercase")
          .refine((v) => slugify(v) === v, {
            message: "Slug must be a valid slug"
          })
          .optional()
          .describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.slug),
        permissions: ProjectPermissionSchema.array()
          .describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.permissions)
          .optional(),
        privilegePermission: ProjectSpecificPrivilegePermissionSchema.describe(
          IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.privilegePermission
        ).optional(),
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
          privilege: SanitizedIdentityPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { permissions, privilegePermission } = req.body;
      if (!permissions && !privilegePermission) {
        throw new UnauthorizedError({ message: "Permission or privilegePermission must be provided" });
      }

      const permission = privilegePermission
        ? privilegePermission.actions.map((action) => ({
            action,
            subject: privilegePermission.subject,
            conditions: privilegePermission.conditions
          }))
        : permissions!;

      const privilege = await server.services.identityProjectAdditionalPrivilege.create({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body,
        slug: req.body.slug ? slugify(req.body.slug) : slugify(alphaNumericNanoId(12)),
        isTemporary: true,
        permissions: JSON.stringify(packRules(permission))
      });
      return { privilege };
    }
  });

  server.route({
    method: "PATCH",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Update a specific privilege of an identity.",
      security: [
        {
          bearerAuth: []
        }
      ],
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
            permissions: ProjectPermissionSchema.array().describe(IDENTITY_ADDITIONAL_PRIVILEGE.UPDATE.permissions),
            privilegePermission: ProjectSpecificPrivilegePermissionSchema.describe(
              IDENTITY_ADDITIONAL_PRIVILEGE.UPDATE.privilegePermission
            ).optional(),
            isTemporary: z.boolean().describe(IDENTITY_ADDITIONAL_PRIVILEGE.UPDATE.isTemporary),
            temporaryMode: z
              .nativeEnum(IdentityProjectAdditionalPrivilegeTemporaryMode)
              .describe(IDENTITY_ADDITIONAL_PRIVILEGE.UPDATE.temporaryMode),
            temporaryRange: z
              .string()
              .refine((val) => typeof val === "undefined" || ms(val) > 0, "Temporary range must be a positive number")
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
          privilege: SanitizedIdentityPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { permissions, privilegePermission, ...updatedInfo } = req.body.privilegeDetails;
      if (!permissions && !privilegePermission) {
        throw new UnauthorizedError({ message: "Permission or privilegePermission must be provided" });
      }

      const permission = privilegePermission
        ? privilegePermission.actions.map((action) => ({
            action,
            subject: privilegePermission.subject,
            conditions: privilegePermission.conditions
          }))
        : permissions!;
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
          permissions: permission ? JSON.stringify(packRules(permission)) : undefined
        }
      });
      return { privilege };
    }
  });

  server.route({
    method: "DELETE",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Delete a specific privilege of an identity.",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        privilegeSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.DELETE.slug),
        identityId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.DELETE.identityId),
        projectSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.DELETE.projectSlug)
      }),
      response: {
        200: z.object({
          privilege: SanitizedIdentityPrivilegeSchema
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
    method: "GET",
    url: "/:privilegeSlug",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Retrieve details of a specific privilege by privilege slug.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        privilegeSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.GET_BY_SLUG.slug)
      }),
      querystring: z.object({
        identityId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.GET_BY_SLUG.identityId),
        projectSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.GET_BY_SLUG.projectSlug)
      }),
      response: {
        200: z.object({
          privilege: SanitizedIdentityPrivilegeSchema
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
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List of a specific privilege of an identity in a project.",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        identityId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.LIST.identityId),
        projectSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.LIST.projectSlug)
      }),
      response: {
        200: z.object({
          privileges: SanitizedIdentityPrivilegeSchema.array()
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
      return {
        privileges
      };
    }
  });
};
