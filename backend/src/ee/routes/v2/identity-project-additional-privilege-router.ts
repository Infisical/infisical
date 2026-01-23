import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { AccessScope, TemporaryPermissionMode } from "@app/db/schemas/models";
import { checkForInvalidPermissionCombination } from "@app/ee/services/permission/permission-fns";
import { ProjectPermissionV2Schema } from "@app/ee/services/permission/project-permission";
import { ApiDocsTags, IDENTITY_ADDITIONAL_PRIVILEGE_V2 } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedIdentityPrivilegeSchema } from "@app/server/routes/sanitizedSchema/identitiy-additional-privilege";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

export const registerIdentityProjectAdditionalPrivilegeRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "createIdentityProjectAdditionalPrivilege",
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
              .nativeEnum(TemporaryPermissionMode)
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
      const { additionalPrivilege: privilege } = await server.services.additionalPrivilege.createAdditionalPrivilege({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          projectId: req.body.projectId,
          orgId: req.permission.orgId
        },
        data: {
          actorId: req.body.identityId,
          actorType: ActorType.IDENTITY,
          ...req.body.type,
          name: req.body.slug || slugify(alphaNumericNanoId(8)),
          permissions: req.body.permissions
        }
      });

      return {
        privilege: {
          ...privilege,
          identityId: req.body.identityId,
          projectId: req.body.projectId,
          slug: privilege.name
        }
      };
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
      operationId: "updateIdentityProjectAdditionalPrivilege",
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
              .nativeEnum(TemporaryPermissionMode)
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
      const { privilege: privilegeDoc } = await server.services.convertor.additionalPrivilegeIdToDoc(req.params.id);

      const { additionalPrivilege: privilege } = await server.services.additionalPrivilege.updateAdditionalPrivilege({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          projectId: privilegeDoc.projectId as string,
          orgId: req.permission.orgId
        },
        selector: {
          id: req.params.id,
          actorId: privilegeDoc.actorIdentityId as string,
          actorType: ActorType.IDENTITY
        },
        data: {
          ...req.body,
          name: req.body.slug,
          ...req.body.type,
          permissions: req.body.permissions || undefined
        }
      });

      return {
        privilege: {
          ...privilege,
          identityId: privilegeDoc.actorIdentityId as string,
          projectId: privilegeDoc.projectId as string,
          slug: privilege.name
        }
      };
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
      operationId: "deleteIdentityProjectAdditionalPrivilege",
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
      const { privilege: privilegeDoc } = await server.services.convertor.additionalPrivilegeIdToDoc(req.params.id);

      const { additionalPrivilege: privilege } = await server.services.additionalPrivilege.deleteAdditionalPrivilege({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          projectId: privilegeDoc.projectId as string,
          orgId: req.permission.orgId
        },
        selector: {
          id: req.params.id,
          actorId: privilegeDoc.actorIdentityId as string,
          actorType: ActorType.IDENTITY
        }
      });

      return {
        privilege: {
          ...privilege,
          identityId: privilegeDoc.actorIdentityId as string,
          projectId: privilegeDoc.projectId as string,
          slug: privilege.name
        }
      };
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
      operationId: "getIdentityProjectAdditionalPrivilege",
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
      const { privilege: privilegeDoc } = await server.services.convertor.additionalPrivilegeIdToDoc(req.params.id);

      const { additionalPrivilege: privilege } = await server.services.additionalPrivilege.getAdditionalPrivilegeById({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          projectId: privilegeDoc.projectId as string,
          orgId: req.permission.orgId
        },
        selector: {
          id: req.params.id,
          actorId: privilegeDoc.actorIdentityId as string,
          actorType: ActorType.IDENTITY
        }
      });

      return {
        privilege: {
          ...privilege,
          identityId: privilegeDoc.actorIdentityId as string,
          projectId: privilegeDoc.projectId as string,
          slug: privilege.name
        }
      };
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
      operationId: "getIdentityProjectAdditionalPrivilegeBySlug",
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
      const { id: projectId } = await server.services.convertor.projectSlugToId({
        slug: req.query.projectSlug,
        orgId: req.permission.orgId
      });

      const { additionalPrivilege: privilege } = await server.services.additionalPrivilege.getAdditionalPrivilegeByName(
        {
          permission: req.permission,
          scopeData: {
            scope: AccessScope.Project,
            projectId,
            orgId: req.permission.orgId
          },
          selector: {
            name: req.params.privilegeSlug,
            actorId: req.query.identityId,
            actorType: ActorType.IDENTITY
          }
        }
      );

      return {
        privilege: {
          ...privilege,
          identityId: req.query.identityId,
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
      operationId: "listIdentityProjectAdditionalPrivileges",
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
      const { additionalPrivileges: privileges } = await server.services.additionalPrivilege.listAdditionalPrivileges({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          projectId: req.query.projectId,
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
          projectId: req.query.projectId,
          slug: privilege.name
        }))
      };
    }
  });
};
