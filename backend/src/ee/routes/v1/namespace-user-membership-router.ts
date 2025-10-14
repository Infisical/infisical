import { z } from "zod";

import { AccessScope, TemporaryPermissionMode } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, NAMESPACE_USERS } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const SanitizedNamespaceUserMembershipDetailSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
  userId: z.string().uuid(),
  namespaceId: z.string(),
  user: z.object({
    email: z.string().nullable().optional(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    isEmailVerified: z.boolean().nullable().optional(),
    id: z.string().uuid(),
    username: z.string()
  }),
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
});

export const SanitizedNamespaceUserMembershipSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
  userId: z.string().uuid(),
  namespaceId: z.string()
});

export const registerNamespaceUserMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:namespaceId/memberships",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceUsers],
      description: "Return namespace user memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceId: z.string().trim().describe(NAMESPACE_USERS.GET_USER_MEMBERSHIPS.namespaceId)
      }),
      response: {
        200: z.object({
          memberships: SanitizedNamespaceUserMembershipDetailSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { data: memberships } = await server.services.membershipUser.listMemberships({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          orgId: req.permission.orgId,
          namespaceId: req.params.namespaceId
        },
        data: {}
      });

      return {
        memberships: memberships.map((el) => ({
          ...el,
          userId: el.actorUserId as string,
          namespaceId: req.params.namespaceId
        }))
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:namespaceId/memberships/:userId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Return namespace user membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceId: z.string().min(1).trim().describe(NAMESPACE_USERS.GET_USER_MEMBERSHIP.namespaceId),
        userId: z.string().min(1).trim().describe(NAMESPACE_USERS.GET_USER_MEMBERSHIP.userId)
      }),
      response: {
        200: z.object({
          membership: SanitizedNamespaceUserMembershipDetailSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.membershipUser.getMembershipByUserId({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          orgId: req.permission.orgId,
          namespaceId: req.params.namespaceId
        },
        selector: {
          userId: req.params.userId
        }
      });

      return {
        membership: {
          ...membership,
          userId: req.params.userId,
          namespaceId: req.params.namespaceId
        }
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:namespaceId/memberships",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceUsers],
      description: "Invite members to namespace",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceId: z.string().describe(NAMESPACE_USERS.CREATE_USER_MEMBERSHIP.namespaceId)
      }),
      body: z.object({
        usernames: z
          .string()
          .array()
          .default([])
          .describe(NAMESPACE_USERS.CREATE_USER_MEMBERSHIP.usernames)
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Username must be lowercase"),
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
          .describe(NAMESPACE_USERS.CREATE_USER_MEMBERSHIP.roles)
      }),
      response: {
        200: z.object({
          memberships: SanitizedNamespaceUserMembershipSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { memberships } = await server.services.membershipUser.createMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          orgId: req.permission.orgId,
          namespaceId: req.params.namespaceId
        },
        data: {
          roles: req.body.roles,
          usernames: req.body.usernames
        }
      });

      await server.services.auditLog.createAuditLog({
        orgId: req.permission.orgId,
        namespaceId: req.params.namespaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.ADD_NAMESPACE_MEMBERS,
          metadata: {
            users: memberships.map(({ actorUserId, id }) => ({
              userId: actorUserId || "",
              membershipId: id,
              // TODO(namespace): fix this
              username: actorUserId || ""
            })),
            roles: req.body.roles
          }
        }
      });

      return {
        memberships: memberships.map((el) => ({
          ...el,
          userId: el.actorUserId as string,
          namespaceId: req.params.namespaceId
        }))
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:namespaceId/memberships/:userId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceUsers],
      description: "Update namespace user membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceId: z.string().trim().describe(NAMESPACE_USERS.UPDATE_USER_MEMBERSHIP.namespaceId),
        userId: z.string().trim().describe(NAMESPACE_USERS.UPDATE_USER_MEMBERSHIP.userId)
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
          .describe(NAMESPACE_USERS.UPDATE_USER_MEMBERSHIP.roles)
      }),
      response: {
        200: z.object({
          roles: SanitizedNamespaceUserMembershipDetailSchema.shape.roles
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { membership } = await server.services.membershipUser.updateMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          orgId: req.permission.orgId,
          namespaceId: req.params.namespaceId
        },
        selector: {
          userId: req.params.userId
        },
        data: {
          roles: req.body.roles
        }
      });

      return { roles: membership.roles.map((el) => ({ ...el, namespaceId: req.params.namespaceId })) };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:namespaceId/memberships/:userId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Delete namespace user membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceId: z.string().trim(),
        userId: z.string().trim()
      }),
      response: {
        200: z.object({
          membership: SanitizedNamespaceUserMembershipSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { membership } = await server.services.membershipUser.deleteMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          orgId: req.permission.orgId,
          namespaceId: req.params.namespaceId
        },
        selector: {
          userId: req.params.userId
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        namespaceId: req.params.namespaceId,
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
          userId: req.params.userId,
          namespaceId: req.params.namespaceId
        }
      };
    }
  });

  // TODO(namespace): add leave operation
  // server.route({
  //   method: "DELETE",
  //   url: "/:namespaceId/leave",
  //   config: {
  //     rateLimit: writeLimit
  //   },
  //   schema: {
  //     params: z.object({
  //       namespaceId: z.string().trim()
  //     }),
  //     response: {
  //       200: z.object({
  //         membership: ProjectMembershipsSchema
  //       })
  //     }
  //   },
  //
  //   onRequest: verifyAuth([AuthMode.JWT]),
  //   handler: async (req) => {
  //     const membership = await server.services.projectMembership.leaveProject({
  //       actorId: req.permission.id,
  //       actor: req.permission.type,
  //       namespaceId: req.params.namespaceId
  //     });
  //     return {
  //       membership: {
  //         ...membership,
  //         userId: membership.actorUserId as string,
  //         namespaceId: req.params.namespaceId
  //       }
  //     };
  //   }
  // });
};
