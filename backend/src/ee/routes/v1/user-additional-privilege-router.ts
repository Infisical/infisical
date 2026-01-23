import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { AccessScope, TemporaryPermissionMode } from "@app/db/schemas/models";
import { checkForInvalidPermissionCombination } from "@app/ee/services/permission/permission-fns";
import { ProjectPermissionV2Schema } from "@app/ee/services/permission/project-permission";
import { PROJECT_USER_ADDITIONAL_PRIVILEGE } from "@app/lib/api-docs";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedUserProjectAdditionalPrivilegeSchema } from "@app/server/routes/sanitizedSchema/user-additional-privilege";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

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
              .nativeEnum(TemporaryPermissionMode)
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
      const { userId, membership } = await server.services.convertor.userMembershipIdToUserId(
        req.body.projectMembershipId,
        AccessScope.Project,
        req.permission.orgId
      );

      const { additionalPrivilege: privilege } = await server.services.additionalPrivilege.createAdditionalPrivilege({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          projectId: membership.scopeProjectId as string,
          orgId: req.permission.orgId
        },
        data: {
          actorId: userId,
          actorType: ActorType.USER,
          ...req.body.type,
          name: req.body.slug || slugify(alphaNumericNanoId(8)),
          permissions: req.body.permissions
        }
      });

      return {
        privilege: { ...privilege, userId, projectId: membership.scopeProjectId as string, slug: privilege.name }
      };
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
                .nativeEnum(TemporaryPermissionMode)
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
      const data = await server.services.convertor.additionalPrivilegeIdToDoc(req.params.privilegeId);
      if (!data.privilege.actorUserId)
        throw new NotFoundError({ message: `Privilege with id ${req.params.privilegeId} not found` });

      const isLinkedToAccessApproval = await server.services.additionalPrivilege.isPrivilegeLinkedToAccessApproval(
        req.params.privilegeId
      );
      if (isLinkedToAccessApproval) {
        throw new BadRequestError({
          message: "Cannot update a privilege that was created from an access approval request"
        });
      }

      const { additionalPrivilege: privilege } = await server.services.additionalPrivilege.updateAdditionalPrivilege({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          projectId: data.privilege.projectId as string,
          orgId: req.permission.orgId
        },
        data: {
          ...req.body,
          ...req.body.type,
          name: req.body.slug,
          permissions: req.body.permissions
            ? // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore-error this is valid ts
              req.body.permissions
            : undefined
        },
        selector: {
          id: req.params.privilegeId,
          actorId: data.privilege.actorUserId,
          actorType: ActorType.USER
        }
      });

      return {
        privilege: {
          ...privilege,
          userId: data.privilege.actorUserId,
          projectId: data.privilege.projectId as string,
          slug: privilege.name
        }
      };
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
      const data = await server.services.convertor.additionalPrivilegeIdToDoc(req.params.privilegeId);
      if (!data.privilege.actorUserId)
        throw new NotFoundError({ message: `Privilege with id ${req.params.privilegeId} not found` });

      const isLinkedToAccessApproval = await server.services.additionalPrivilege.isPrivilegeLinkedToAccessApproval(
        req.params.privilegeId
      );
      if (isLinkedToAccessApproval) {
        throw new BadRequestError({
          message: "Cannot delete a privilege that was created from an access approval request"
        });
      }

      const { additionalPrivilege: privilege } = await server.services.additionalPrivilege.deleteAdditionalPrivilege({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          projectId: data.privilege.projectId as string,
          orgId: req.permission.orgId
        },
        selector: {
          id: req.params.privilegeId,
          actorId: data.privilege.actorUserId,
          actorType: ActorType.USER
        }
      });

      return {
        privilege: {
          ...privilege,
          userId: data.privilege.actorUserId,
          projectId: data.privilege.projectId as string,
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
      querystring: z.object({
        projectMembershipId: z.string().describe(PROJECT_USER_ADDITIONAL_PRIVILEGE.LIST.projectMembershipId)
      }),
      response: {
        200: z.object({
          privileges: SanitizedUserProjectAdditionalPrivilegeSchema.omit({ permissions: true })
            .extend({ isLinkedToAccessApproval: z.boolean() })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { userId, membership } = await server.services.convertor.userMembershipIdToUserId(
        req.query.projectMembershipId,
        AccessScope.Project,
        req.permission.orgId
      );

      const { additionalPrivileges: privileges } =
        await server.services.additionalPrivilege.listAdditionalPrivilegesWithAccessApprovalStatus({
          permission: req.permission,
          scopeData: {
            scope: AccessScope.Project,
            projectId: membership.scopeProjectId as string,
            orgId: req.permission.orgId
          },
          selector: {
            actorId: userId,
            actorType: ActorType.USER
          }
        });

      return {
        privileges: privileges.map((privilege) => ({
          ...privilege,
          userId: membership.actorUserId as string,
          projectId: membership.scopeProjectId as string,
          slug: privilege.name
        }))
      };
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
      const data = await server.services.convertor.additionalPrivilegeIdToDoc(req.params.privilegeId);
      if (!data.privilege.actorUserId)
        throw new NotFoundError({ message: `Privilege with id ${req.params.privilegeId} not found` });

      const { additionalPrivilege: privilege } = await server.services.additionalPrivilege.getAdditionalPrivilegeById({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          projectId: data.privilege.projectId as string,
          orgId: req.permission.orgId
        },
        selector: {
          id: req.params.privilegeId,
          actorId: data.privilege.actorUserId,
          actorType: ActorType.USER
        }
      });

      return {
        privilege: {
          ...privilege,
          userId: data.privilege.actorUserId,
          projectId: data.privilege.projectId as string,
          slug: privilege.name
        }
      };
    }
  });
};
