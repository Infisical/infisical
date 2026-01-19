import { z } from "zod";

import {
  AccessScope,
  ProjectMembershipRole,
  ProjectMembershipsSchema,
  ProjectUserMembershipRolesSchema,
  TemporaryPermissionMode,
  UserEncryptionKeysSchema,
  UsersSchema
} from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, PROJECT_USERS } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

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
          memberships: ProjectMembershipsSchema.extend({
            user: UsersSchema.pick({
              email: true,
              firstName: true,
              lastName: true,
              id: true,
              username: true
            }).merge(UserEncryptionKeysSchema.pick({ publicKey: true })),
            roles: z.array(
              z.object({
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
              })
            )
          })
            .omit({ updatedAt: true })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
          membership: ProjectMembershipsSchema.extend({
            user: UsersSchema.pick({
              email: true,
              firstName: true,
              lastName: true,
              id: true,
              username: true
            }).merge(UserEncryptionKeysSchema.pick({ publicKey: true })),
            roles: z.array(
              z.object({
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
              })
            )
          }).omit({ updatedAt: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
          membership: ProjectMembershipsSchema.extend({
            user: UsersSchema.pick({
              email: true,
              firstName: true,
              lastName: true,
              id: true
            }).merge(UserEncryptionKeysSchema.pick({ publicKey: true })),
            roles: z.array(
              z.object({
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
              })
            )
          }).omit({ createdAt: true, updatedAt: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
          metadata: memberships.map(({ actorUserId, id }) => ({
            userId: actorUserId || "",
            membershipId: id,
            email: ""
          }))
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
      return {
        membership: {
          ...membership,
          userId: membership.actorUserId as string,
          projectId: req.params.projectId
        }
      };
    }
  });
};
