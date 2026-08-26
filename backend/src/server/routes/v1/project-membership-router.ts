import { z } from "zod";

import {
  AccessScope,
  ProjectMembershipRole,
  ProjectMembershipsSchema,
  ProjectUserMembershipRolesSchema,
  SecretFolderRole,
  TemporaryPermissionMode
} from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, FOLDER_ACCESS, PROJECT_USERS } from "@app/lib/api-docs";
import { prefixWithSlash, removeTrailingSlash } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { temporaryPermissionTypeSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { SanitizedFolderAccessSchema, SanitizedFolderAccessUserSchema } from "../sanitizedSchema/folder-access";
import { booleanSchema, SanitizedUserSchema } from "../sanitizedSchemas";

const projectUserMembershipRoleSchema = z.object({
  id: z.string(),
  role: z.string(),
  customRoleId: z.string().optional().nullable(),
  customRoleName: z.string().optional().nullable(),
  customRoleSlug: z.string().optional().nullable(),
  isTemporary: z.boolean(),
  temporaryMode: z.string().optional().nullable(),
  temporaryRange: z.string().nullable().optional(),
  temporaryAccessStartTime: z.date().nullable().optional(),
  temporaryAccessEndTime: z.date().nullable().optional()
});

const projectUserMembershipSchema = ProjectMembershipsSchema.extend({
  user: SanitizedUserSchema,
  roles: z.array(projectUserMembershipRoleSchema)
});

const folderAccessFolderFields = (docs: { environmentSlug: string; secretPath: string }) => ({
  environmentSlug: z.string().trim().min(1).max(64).describe(docs.environmentSlug),
  secretPath: z
    .string()
    .trim()
    .min(1)
    .max(1024)
    .transform(prefixWithSlash)
    .transform(removeTrailingSlash)
    .describe(docs.secretPath)
});

const userFolderAccessParamsSchema = z.object({
  projectId: z.string().trim().min(1).max(64).describe(FOLDER_ACCESS.CREATE.projectId),
  userId: z.string().uuid().describe(FOLDER_ACCESS.CREATE.userId)
});

const folderAccessCreateTypeSchema = temporaryPermissionTypeSchema(FOLDER_ACCESS.CREATE);
const folderAccessUpdateTypeSchema = temporaryPermissionTypeSchema(FOLDER_ACCESS.UPDATE);

const userFolderAccessResponseSchema = SanitizedFolderAccessSchema.extend({
  userId: z.string().uuid()
});

export const registerProjectMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:projectId/memberships",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectUsers],
      description: "Return project user memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_USERS.GET_USER_MEMBERSHIPS.projectId)
      }),
      response: {
        200: z.object({
          memberships: projectUserMembershipSchema.omit({ updatedAt: true }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { data: memberships } = await server.services.membershipUser.listMemberships({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        data: {}
      });

      return {
        memberships: memberships.map((el) => ({
          ...el,
          userId: el.actorUserId as string,
          projectId: req.params.projectId
        }))
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/memberships/:membershipId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getProjectMembership",
      description: "Return project user membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().min(1).trim().describe(PROJECT_USERS.GET_USER_MEMBERSHIP.projectId),
        membershipId: z.string().min(1).trim().describe(PROJECT_USERS.GET_USER_MEMBERSHIP.membershipId)
      }),
      response: {
        200: z.object({
          membership: projectUserMembershipSchema.omit({ updatedAt: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { userId } = await server.services.convertor.userMembershipIdToUserId(
        req.params.membershipId,
        AccessScope.Project,
        req.permission.orgId
      );
      const membership = await server.services.membershipUser.getMembershipByUserId({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        selector: {
          userId
        }
      });

      return {
        membership: {
          ...membership,
          userId,
          projectId: req.params.projectId
        }
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/user/:userId/membership",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getProjectMembershipByUserId",
      tags: [ApiDocsTags.ProjectUsers],
      description: "Return a project user's membership by user ID",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().min(1).uuid().trim().describe(PROJECT_USERS.GET_USER_MEMBERSHIP_BY_USER_ID.projectId),
        userId: z.string().min(1).uuid().trim().describe(PROJECT_USERS.GET_USER_MEMBERSHIP_BY_USER_ID.userId)
      }),
      response: {
        200: z.object({
          membership: projectUserMembershipSchema.omit({ updatedAt: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const membership = await server.services.membershipUser.getMembershipByUserId({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        selector: {
          userId: req.params.userId
        }
      });

      return {
        membership: {
          ...membership,
          userId: req.params.userId,
          projectId: req.params.projectId
        }
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/memberships/:membershipId/permissions/audit",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: true,
      params: z.object({
        projectId: z.string().min(1).trim(),
        membershipId: z.string().min(1).trim()
      }),
      querystring: z.object({
        includeFolderPermissions: booleanSchema.describe(FOLDER_ACCESS.PERMISSION_AUDIT.includeFolderPermissions)
      }),
      response: {
        200: z.object({
          sources: z
            .object({
              id: z.string(),
              type: z.enum(["role", "group_role", "additional_privilege"]),
              name: z.string(),
              slug: z.string().optional(),
              groupId: z.string().optional(),
              groupName: z.string().optional(),
              isTemporary: z.boolean(),
              temporaryAccessStartTime: z.string().optional(),
              temporaryAccessEndTime: z.string().optional(),
              permissions: z.array(z.unknown())
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { userId } = await server.services.convertor.userMembershipIdToUserId(
        req.params.membershipId,
        AccessScope.Project,
        req.permission.orgId
      );

      const { sources } = await server.services.permission.getMembershipPermissionAudit({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        targetUserId: userId,
        includeFolderPermissions: req.query.includeFolderPermissions
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.params.projectId,
        ...req.auditLogInfo,
        event: {
          type: EventType.GET_PROJECT_MEMBER_PERMISSION_AUDIT,
          metadata: {
            targetUserId: userId,
            membershipId: req.params.membershipId
          }
        }
      });

      return { sources };
    }
  });

  server.route({
    method: "POST",
    url: "/:projectId/memberships/details",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getProjectMembershipByUsername",
      tags: [ApiDocsTags.ProjectUsers],
      description: "Return project user memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().min(1).trim().describe(PROJECT_USERS.GET_USER_MEMBERSHIP.projectId)
      }),
      body: z.object({
        username: z.string().min(1).trim().describe(PROJECT_USERS.GET_USER_MEMBERSHIP.username)
      }),
      response: {
        200: z.object({
          membership: projectUserMembershipSchema.omit({ createdAt: true, updatedAt: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const membership = await server.services.projectMembership.getProjectMembershipByUsername({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        username: req.body.username
      });
      return { membership };
    }
  });

  server.route({
    method: "POST",
    url: "/:projectId/memberships",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "inviteProjectMembers",
      tags: [ApiDocsTags.ProjectUsers],
      description: "Invite members to project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().describe(PROJECT_USERS.INVITE_MEMBER.projectId)
      }),
      body: z.object({
        emails: z
          .string()
          .email()
          .array()
          .default([])
          .describe(PROJECT_USERS.INVITE_MEMBER.emails)
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Email must be lowercase"),
        usernames: z
          .string()
          .array()
          .default([])
          .describe(PROJECT_USERS.INVITE_MEMBER.usernames)
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Username must be lowercase"),
        roleSlugs: z.string().array().min(1).optional().describe(PROJECT_USERS.INVITE_MEMBER.roleSlugs)
      }),
      response: {
        200: z.object({
          memberships: ProjectMembershipsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const usernamesAndEmails = [...req.body.emails, ...req.body.usernames];

      await server.services.membershipUser.createMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
        },
        data: {
          roles: [],
          usernames: usernamesAndEmails
        }
      });

      const { memberships } = await server.services.membershipUser.createMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        data: {
          roles: (req.body.roleSlugs || [ProjectMembershipRole.Member]).map((role) => ({ isTemporary: false, role })),
          usernames: usernamesAndEmails
        }
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.params.projectId,
        ...req.auditLogInfo,
        event: {
          type: EventType.ADD_BATCH_PROJECT_MEMBER,
          metadata: {
            members: memberships.map(({ actorUserId, id }) => ({
              userId: actorUserId || "",
              membershipId: id,
              email: ""
            }))
          }
        }
      });

      void server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.ProjectMembershipCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          projectId: req.params.projectId,
          userIds: memberships.map((m) => m.actorUserId).filter((id): id is string => Boolean(id)),
          roles: req.body.roleSlugs || [ProjectMembershipRole.Member]
        }
      });

      return {
        memberships: memberships.map((el) => ({
          ...el,
          userId: el.actorUserId as string,
          projectId: req.params.projectId
        }))
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:projectId/memberships/:membershipId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "updateProjectMembership",
      tags: [ApiDocsTags.ProjectUsers],
      description: "Update project user membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_USERS.UPDATE_USER_MEMBERSHIP.projectId),
        membershipId: z.string().trim().describe(PROJECT_USERS.UPDATE_USER_MEMBERSHIP.membershipId)
      }),
      body: z.object({
        roles: z
          .array(
            z.union([
              z.object({
                role: z.string(),
                isTemporary: z.literal(false).default(false)
              }),
              z.object({
                role: z.string(),
                isTemporary: z.literal(true),
                temporaryMode: z.nativeEnum(TemporaryPermissionMode),
                temporaryRange: z.string().refine((val) => ms(val) > 0, "Temporary range must be a positive number"),
                temporaryAccessStartTime: z.string().datetime()
              })
            ])
          )
          .min(1)
          .refine((data) => data.some(({ isTemporary }) => !isTemporary), "At least one long lived role is required")
          .describe(PROJECT_USERS.UPDATE_USER_MEMBERSHIP.roles)
      }),
      response: {
        200: z.object({
          roles: ProjectUserMembershipRolesSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { userId } = await server.services.convertor.userMembershipIdToUserId(
        req.params.membershipId,
        AccessScope.Project,
        req.permission.orgId
      );

      const { membership } = await server.services.membershipUser.updateMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        selector: {
          userId
        },
        data: {
          roles: req.body.roles
        }
      });

      void server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.ProjectMembershipRoleUpdated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          projectId: req.params.projectId,
          userId,
          roles: req.body.roles.map((r) => r.role)
        }
      });

      return { roles: membership.roles.map((el) => ({ ...el, projectMembershipId: req.params.membershipId })) };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/memberships",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "removeProjectMembers",
      tags: [ApiDocsTags.ProjectUsers],
      description: "Remove members from project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().describe(PROJECT_USERS.REMOVE_MEMBER.projectId)
      }),
      body: z.object({
        emails: z
          .string()
          .email()
          .array()
          .default([])
          .describe(PROJECT_USERS.REMOVE_MEMBER.emails)
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Email must be lowercase"),
        usernames: z
          .string()
          .array()
          .default([])
          .describe(PROJECT_USERS.REMOVE_MEMBER.usernames)
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Username must be lowercase")
      }),
      response: {
        200: z.object({
          memberships: ProjectMembershipsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const memberships = await server.services.projectMembership.deleteProjectMemberships({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        emails: req.body.emails,
        usernames: req.body.usernames
      });

      for (const membership of memberships) {
        // eslint-disable-next-line no-await-in-loop
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId: req.params.projectId,
          event: {
            type: EventType.REMOVE_PROJECT_MEMBER,
            metadata: {
              userId: membership.actorUserId as string,
              email: ""
            }
          }
        });
      }

      void server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.ProjectMembershipDeleted,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          projectId: req.params.projectId,
          userIds: memberships.map((m) => m.actorUserId).filter((id): id is string => Boolean(id))
        }
      });

      return {
        memberships: memberships.map((el) => ({
          ...el,
          userId: el.actorUserId as string,
          projectId: req.params.projectId
        }))
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/memberships/:membershipId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deleteProjectMembership",
      description: "Delete project user membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim(),
        membershipId: z.string().trim()
      }),
      response: {
        200: z.object({
          membership: ProjectMembershipsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { userId } = await server.services.convertor.userMembershipIdToUserId(
        req.params.membershipId,
        AccessScope.Project,
        req.permission.orgId
      );

      const { membership } = await server.services.membershipUser.deleteMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        selector: {
          userId
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.projectId,
        event: {
          type: EventType.REMOVE_PROJECT_MEMBER,
          metadata: {
            userId: membership.actorUserId as string,
            email: ""
          }
        }
      });

      void server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.ProjectMembershipDeleted,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          projectId: req.params.projectId,
          userIds: [userId]
        }
      });

      return {
        membership: {
          ...membership,
          userId,
          projectId: req.params.projectId
        }
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/leave",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "leaveProject",
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          membership: ProjectMembershipsSchema
        })
      }
    },

    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const membership = await server.services.projectMembership.leaveProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        projectId: req.params.projectId
      });

      void server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.ProjectMembershipDeleted,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          projectId: req.params.projectId,
          userIds: [membership.actorUserId as string]
        }
      });

      return {
        membership: {
          ...membership,
          userId: membership.actorUserId as string,
          projectId: req.params.projectId
        }
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:projectId/users/:userId/secret-folder-access",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: true,
      operationId: "createUserFolderAccess",
      tags: [ApiDocsTags.FolderAccess],
      description: "Grant a user access to a folder.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: userFolderAccessParamsSchema,
      body: z.object({
        ...folderAccessFolderFields(FOLDER_ACCESS.CREATE),
        permission: z.nativeEnum(SecretFolderRole).describe(FOLDER_ACCESS.CREATE.permission),
        type: folderAccessCreateTypeSchema.optional()
      }),
      response: {
        200: z.object({
          folderAccess: userFolderAccessResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { folderAccess } = await server.services.folderPermission.createFolderGrant({
        permission: req.permission,
        projectId: req.params.projectId,
        environmentSlug: req.body.environmentSlug,
        secretPath: req.body.secretPath,
        target: { actorId: req.params.userId, actorType: ActorType.USER },
        role: req.body.permission,
        type: req.body.type
      });

      return { folderAccess: { ...folderAccess, userId: req.params.userId } };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:projectId/users/:userId/secret-folder-access",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: true,
      operationId: "updateUserFolderAccess",
      tags: [ApiDocsTags.FolderAccess],
      description: "Update a user's access to a folder.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: userFolderAccessParamsSchema,
      body: z
        .object({
          ...folderAccessFolderFields(FOLDER_ACCESS.UPDATE),
          permission: z.nativeEnum(SecretFolderRole).optional().describe(FOLDER_ACCESS.UPDATE.permission),
          type: folderAccessUpdateTypeSchema.optional()
        })
        .refine(
          (body) => body.permission !== undefined || body.type !== undefined,
          "Provide at least one of 'permission' or 'type' to update"
        ),
      response: {
        200: z.object({
          folderAccess: userFolderAccessResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { folderAccess } = await server.services.folderPermission.updateFolderGrant({
        permission: req.permission,
        projectId: req.params.projectId,
        environmentSlug: req.body.environmentSlug,
        secretPath: req.body.secretPath,
        target: { actorId: req.params.userId, actorType: ActorType.USER },
        role: req.body.permission,
        type: req.body.type
      });

      return { folderAccess: { ...folderAccess, userId: req.params.userId } };
    }
  });

  // deliberate REST deviation: DELETE carries a body identifying the folder, consistent with
  // DELETE /:projectId/memberships in this router
  server.route({
    method: "DELETE",
    url: "/:projectId/users/:userId/secret-folder-access",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: true,
      operationId: "deleteUserFolderAccess",
      tags: [ApiDocsTags.FolderAccess],
      description: "Revoke a user's access to a folder.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: userFolderAccessParamsSchema,
      body: z.object(folderAccessFolderFields(FOLDER_ACCESS.DELETE)),
      response: {
        200: z.object({
          folderAccess: userFolderAccessResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { folderAccess } = await server.services.folderPermission.deleteFolderGrant({
        permission: req.permission,
        projectId: req.params.projectId,
        environmentSlug: req.body.environmentSlug,
        secretPath: req.body.secretPath,
        target: { actorId: req.params.userId, actorType: ActorType.USER }
      });

      return { folderAccess: { ...folderAccess, userId: req.params.userId } };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/users/:userId/secret-folder-access",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: true,
      operationId: "listUserFolderAccess",
      tags: [ApiDocsTags.FolderAccess],
      description: "List every folder a user has been granted access on in a project.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().min(1).max(64).describe(FOLDER_ACCESS.LIST_USER_GRANTS.projectId),
        userId: z.string().uuid().describe(FOLDER_ACCESS.LIST_USER_GRANTS.userId)
      }),
      response: {
        200: z.object({
          folderAccess: userFolderAccessResponseSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { folderAccess } = await server.services.folderPermission.listActorFolderGrants({
        permission: req.permission,
        projectId: req.params.projectId,
        target: { actorId: req.params.userId, actorType: ActorType.USER }
      });

      return { folderAccess: folderAccess.map((grant) => ({ ...grant, userId: req.params.userId })) };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/secret-folder-access/users",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: true,
      operationId: "listFolderAccessUsers",
      tags: [ApiDocsTags.FolderAccess],
      description:
        "List the users of a project split by whether they have access on a folder, with the project roles that grant it.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().min(1).max(64).describe(FOLDER_ACCESS.LIST_USERS.projectId)
      }),
      querystring: z.object({
        ...folderAccessFolderFields(FOLDER_ACCESS.LIST_USERS),
        offset: z.coerce.number().int().min(0).default(0).describe(FOLDER_ACCESS.LIST_USERS.offset),
        limit: z.coerce.number().int().min(1).max(100).default(50).describe(FOLDER_ACCESS.LIST_USERS.limit),
        search: z.string().trim().max(64).optional().describe(FOLDER_ACCESS.LIST_USERS.search)
      }),
      response: {
        200: z.object({
          users: SanitizedFolderAccessUserSchema.array().describe(FOLDER_ACCESS.LIST_USERS.users),
          usersWithoutAccess: SanitizedFolderAccessUserSchema.array().describe(
            FOLDER_ACCESS.LIST_USERS.usersWithoutAccess
          ),
          totalCount: z.number().describe(FOLDER_ACCESS.LIST_USERS.totalCount),
          totalCountWithoutAccess: z.number().describe(FOLDER_ACCESS.LIST_USERS.totalCountWithoutAccess)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) =>
      server.services.folderPermission.listFolderAccessUsers({
        permission: req.permission,
        projectId: req.params.projectId,
        environmentSlug: req.query.environmentSlug,
        secretPath: req.query.secretPath,
        limit: req.query.limit,
        offset: req.query.offset,
        search: req.query.search
      })
  });
};
