import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { AccessScope, TemporaryPermissionMode } from "@app/db/schemas/models";
import { backfillPermissionV1SchemaToV2Schema } from "@app/ee/services/permission/project-permission";
import { ApiDocsTags, IDENTITY_ADDITIONAL_PRIVILEGE } from "@app/lib/api-docs";
import { UnauthorizedError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import {
  ProjectPermissionSchema,
  ProjectSpecificPrivilegePermissionSchema,
  SanitizedIdentityPrivilegeSchema
} from "@app/server/routes/sanitizedSchemas";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

export const registerIdentityProjectAdditionalPrivilegeRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/permanent",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentitySpecificPrivilegesV1],
      description: "Create a permanent or a non expiry specific privilege for identity.",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        identityId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.identityId),
        projectSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.projectSlug),
        slug: slugSchema({ min: 1, max: 60 }).optional().describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.slug),
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
      const { id: projectId } = await server.services.convertor.projectSlugToId({
        orgId: req.permission.orgId,
        slug: req.body.projectSlug
      });

      const permission = privilegePermission
        ? privilegePermission.actions.map((action) => ({
            action,
            subject: privilegePermission.subject,
            conditions: privilegePermission.conditions
          }))
        : permissions!;

      const { additionalPrivilege: privilege } = await server.services.additionalPrivilege.createAdditionalPrivilege({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          projectId,
          orgId: req.permission.orgId
        },
        data: {
          actorId: req.body.identityId,
          actorType: ActorType.IDENTITY,
          ...req.body,
          isTemporary: false,
          name: req.body.slug || slugify(alphaNumericNanoId(8)),
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore-error this is valid ts
          permissions: backfillPermissionV1SchemaToV2Schema(permission)
        }
      });

      return {
        privilege: {
          ...privilege,
          identityId: req.body.identityId,
          projectMembershipId: projectId,
          projectId,
          slug: privilege.name
        }
      };
    }
  });

  server.route({
    method: "POST",
    url: "/temporary",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentitySpecificPrivilegesV1],
      description: "Create a temporary or a expiring specific privilege for identity.",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        identityId: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.identityId),
        projectSlug: z.string().min(1).describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.projectSlug),
        slug: slugSchema({ min: 1, max: 60 }).optional().describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.slug),
        permissions: ProjectPermissionSchema.array()
          .describe(IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.permissions)
          .optional(),
        privilegePermission: ProjectSpecificPrivilegePermissionSchema.describe(
          IDENTITY_ADDITIONAL_PRIVILEGE.CREATE.privilegePermission
        ).optional(),
        temporaryMode: z
          .nativeEnum(TemporaryPermissionMode)
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

      const { id: projectId } = await server.services.convertor.projectSlugToId({
        orgId: req.permission.orgId,
        slug: req.body.projectSlug
      });

      const { additionalPrivilege: privilege } = await server.services.additionalPrivilege.createAdditionalPrivilege({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          projectId,
          orgId: req.permission.orgId
        },
        data: {
          actorId: req.body.identityId,
          actorType: ActorType.IDENTITY,
          ...req.body,
          isTemporary: true,
          name: req.body.slug || slugify(alphaNumericNanoId(8)),
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore-error this is valid ts
          permissions: backfillPermissionV1SchemaToV2Schema(permission)
        }
      });

      return {
        privilege: {
          ...privilege,
          identityId: req.body.identityId,
          projectMembershipId: projectId,
          projectId,
          slug: privilege.name
        }
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentitySpecificPrivilegesV1],
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
            slug: slugSchema({ min: 1, max: 60 }).describe(IDENTITY_ADDITIONAL_PRIVILEGE.UPDATE.newSlug),
            permissions: ProjectPermissionSchema.array().describe(IDENTITY_ADDITIONAL_PRIVILEGE.UPDATE.permissions),
            privilegePermission: ProjectSpecificPrivilegePermissionSchema.describe(
              IDENTITY_ADDITIONAL_PRIVILEGE.UPDATE.privilegePermission
            ).optional(),
            isTemporary: z.boolean().describe(IDENTITY_ADDITIONAL_PRIVILEGE.UPDATE.isTemporary),
            temporaryMode: z
              .nativeEnum(TemporaryPermissionMode)
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

      const { id: projectId } = await server.services.convertor.projectSlugToId({
        orgId: req.permission.orgId,
        slug: req.body.projectSlug
      });

      const { privilege: privilegeDoc } = await server.services.convertor.additionalPrivilegeNameToDoc(
        req.body.privilegeSlug,
        projectId
      );

      const { additionalPrivilege: privilege } = await server.services.additionalPrivilege.updateAdditionalPrivilege({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          projectId,
          orgId: req.permission.orgId
        },
        selector: {
          actorId: req.body.identityId,
          actorType: ActorType.IDENTITY,
          id: privilegeDoc.id
        },
        data: {
          ...req.body,
          ...updatedInfo,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore-error this is valid ts
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore-error this is valid ts
          permissions: permission
            ? // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore-error this is valid ts
              backfillPermissionV1SchemaToV2Schema(permission)
            : undefined
        }
      });

      return {
        privilege: {
          ...privilege,
          identityId: req.body.identityId,
          projectMembershipId: projectId,
          projectId,
          slug: privilege.name
        }
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentitySpecificPrivilegesV1],
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
      const { id: projectId } = await server.services.convertor.projectSlugToId({
        orgId: req.permission.orgId,
        slug: req.body.projectSlug
      });

      const { privilegeId } = await server.services.convertor.additionalPrivilegeNameToDoc(
        req.body.privilegeSlug,
        projectId
      );

      const { additionalPrivilege: privilege } = await server.services.additionalPrivilege.deleteAdditionalPrivilege({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          projectId,
          orgId: req.permission.orgId
        },
        selector: {
          actorId: req.body.identityId,
          actorType: ActorType.IDENTITY,
          id: privilegeId
        }
      });

      return {
        privilege: {
          ...privilege,
          identityId: req.body.identityId,
          projectMembershipId: projectId,
          projectId,
          slug: privilege.name
        }
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:privilegeSlug",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentitySpecificPrivilegesV1],
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
      const { id: projectId } = await server.services.convertor.projectSlugToId({
        orgId: req.permission.orgId,
        slug: req.query.projectSlug
      });

      const { privilegeId } = await server.services.convertor.additionalPrivilegeNameToDoc(
        req.params.privilegeSlug,
        projectId
      );

      const { additionalPrivilege: privilege } = await server.services.additionalPrivilege.getAdditionalPrivilegeById({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          projectId,
          orgId: req.permission.orgId
        },
        selector: {
          actorId: req.query.identityId,
          actorType: ActorType.IDENTITY,
          id: privilegeId
        }
      });

      return {
        privilege: {
          ...privilege,
          identityId: req.query.identityId,
          projectMembershipId: projectId,
          projectId,
          slug: privilege.name
        }
      };
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
      tags: [ApiDocsTags.IdentitySpecificPrivilegesV1],
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
      const { id: projectId } = await server.services.convertor.projectSlugToId({
        orgId: req.permission.orgId,
        slug: req.query.projectSlug
      });

      const { additionalPrivileges: privileges } = await server.services.additionalPrivilege.listAdditionalPrivileges({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          projectId,
          orgId: req.permission.orgId
        },
        selector: {
          actorId: req.query.identityId,
          actorType: ActorType.IDENTITY
        }
      });

      return {
        privileges: privileges.map((privilege) => ({
          ...privilege,
          identityId: req.query.identityId,
          projectMembershipId: projectId,
          projectId,
          slug: privilege.name
        }))
      };
    }
  });
};
