import { z } from "zod";

import {
  OrgMembershipsSchema,
  ProjectMembershipsSchema,
  ProjectUserMembershipRolesSchema,
  UserEncryptionKeysSchema,
  UsersSchema
} from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, PROJECT_USERS } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { ProjectUserMembershipTemporaryMode } from "@app/services/project-membership/project-membership-types";

export const registerProjectMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:workspaceId/memberships",
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
        workspaceId: z.string().trim().describe(PROJECT_USERS.GET_USER_MEMBERSHIPS.workspaceId)
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
      const memberships = await server.services.projectMembership.getProjectMemberships({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId
      });
      return { memberships };
    }
  });

  server.route({
    method: "GET",
    url: "/:workspaceId/memberships/:membershipId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Return project user membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().min(1).trim().describe(PROJECT_USERS.GET_USER_MEMBERSHIP.workspaceId),
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
      const membership = await server.services.projectMembership.getProjectMembershipById({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId,
        id: req.params.membershipId
      });
      return { membership };
    }
  });

  server.route({
    method: "POST",
    url: "/:workspaceId/memberships/details",
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
        workspaceId: z.string().min(1).trim().describe(PROJECT_USERS.GET_USER_MEMBERSHIP.workspaceId)
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
        projectId: req.params.workspaceId,
        username: req.body.username
      });
      return { membership };
    }
  });

  server.route({
    method: "POST",
    url: "/:workspaceId/memberships",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      body: z.object({
        members: z
          .object({
            orgMembershipId: z.string().trim(),
            workspaceEncryptedKey: z.string().trim(),
            workspaceEncryptedNonce: z.string().trim()
          })
          .array()
          .min(1)
      }),
      response: {
        200: z.object({
          success: z.boolean(),
          data: OrgMembershipsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const data = await server.services.projectMembership.addUsersToProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId,
        members: req.body.members
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.params.workspaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.ADD_BATCH_WORKSPACE_MEMBER,
          metadata: data.map(({ userId }) => ({
            userId: userId || "",
            email: ""
          }))
        }
      });

      return { data, success: true };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:workspaceId/memberships/:membershipId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectUsers],
      description: "Update project user membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(PROJECT_USERS.UPDATE_USER_MEMBERSHIP.workspaceId),
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
                temporaryMode: z.nativeEnum(ProjectUserMembershipTemporaryMode),
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
      const roles = await server.services.projectMembership.updateProjectMembership({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId,
        membershipId: req.params.membershipId,
        roles: req.body.roles
      });

      // await server.services.auditLog.createAuditLog({
      //   ...req.auditLogInfo,
      //   projectId: req.params.workspaceId,
      //   event: {
      //     type: EventType.UPDATE_USER_WORKSPACE_ROLE,
      //     metadata: {
      //       userId: membership.userId,
      //       newRole: req.body.role,
      //       oldRole: membership.role,
      //       email: ""
      //     }
      //   }
      // });
      return { roles };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:workspaceId/memberships/:membershipId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Delete project user membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim(),
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
      const membership = await server.services.projectMembership.deleteProjectMembership({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId,
        membershipId: req.params.membershipId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.REMOVE_WORKSPACE_MEMBER,
          metadata: {
            userId: membership.userId,
            email: ""
          }
        }
      });
      return { membership };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:workspaceId/leave",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
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
        projectId: req.params.workspaceId
      });
      return { membership };
    }
  });
};
