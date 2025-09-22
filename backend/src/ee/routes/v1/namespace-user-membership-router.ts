import { z } from "zod";

import {
  NamespaceMembershipsSchema,
  NamespaceMembershipRolesSchema,
  UsersSchema,
  OrgMembershipRole
} from "@app/db/schemas";
import { ApiDocsTags, NAMESPACE_USER_MEMBERSHIPS } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { NamespaceUserMembershipTemporaryMode } from "@app/ee/services/namespace-user-membership/namespace-user-membership-types";

const SanitizedNamespaceMembershipSchema = NamespaceMembershipsSchema.extend({
  user: UsersSchema.pick({
    email: true,
    firstName: true,
    lastName: true,
    id: true,
    username: true,
    isEmailVerified: true
  }),
  lastLoginAuthMethod: z.string().nullable().optional(),
  lastLoginTime: z.date().nullable().optional(),
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
  ),
  metadata: z.object({ id: z.string(), key: z.string(), value: z.string() }).array()
});

export const registerNamespaceUserMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:namespaceSlug/memberships",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceUserMemberships],
      description: "List namespace user memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceSlug: slugSchema().describe(NAMESPACE_USER_MEMBERSHIPS.LIST.namespaceSlug)
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0).describe(NAMESPACE_USER_MEMBERSHIPS.LIST.offset),
        limit: z.coerce.number().min(1).max(10000).default(50).describe(NAMESPACE_USER_MEMBERSHIPS.LIST.limit)
      }),
      response: {
        200: z.object({
          members: SanitizedNamespaceMembershipSchema.array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { members, totalCount } = await server.services.namespaceUserMembership.listNamespaceMemberships({
        permission: req.permission,
        namespaceSlug: req.params.namespaceSlug,
        limit: req.query.limit,
        offset: req.query.offset
      });
      return { members, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:namespaceSlug/memberships/:membershipId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceUserMemberships],
      description: "Get namespace user membership by ID",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceSlug: slugSchema().describe(NAMESPACE_USER_MEMBERSHIPS.GET.namespaceSlug),
        membershipId: z.string().trim().describe(NAMESPACE_USER_MEMBERSHIPS.GET.membershipId)
      }),
      response: {
        200: z.object({
          membership: SanitizedNamespaceMembershipSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.namespaceUserMembership.getNamespaceMembershipById({
        permission: req.permission,
        namespaceSlug: req.params.namespaceSlug,
        membershipId: req.params.membershipId
      });
      return { membership };
    }
  });

  server.route({
    method: "GET",
    url: "/:namespaceSlug/memberships/search",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceUserMemberships],
      description: "Search namespace user memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceSlug: slugSchema().describe(NAMESPACE_USER_MEMBERSHIPS.SEARCH.namespaceSlug)
      }),
      querystring: z.object({
        username: z.string().optional().describe(NAMESPACE_USER_MEMBERSHIPS.SEARCH.username),
        offset: z.coerce.number().min(0).default(0).describe(NAMESPACE_USER_MEMBERSHIPS.SEARCH.offset),
        limit: z.coerce.number().min(1).max(100).default(50).describe(NAMESPACE_USER_MEMBERSHIPS.SEARCH.limit)
      }),
      response: {
        200: z.object({
          members: SanitizedNamespaceMembershipSchema.array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { members, totalCount } = await server.services.namespaceUserMembership.searchNamespaceMemberships({
        permission: req.permission,
        namespaceSlug: req.params.namespaceSlug,
        username: req.query.username,
        limit: req.query.limit,
        offset: req.query.offset
      });
      return { members, totalCount };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:namespaceSlug/memberships/:membershipId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceUserMemberships],
      description: "Update namespace user membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceSlug: slugSchema().describe(NAMESPACE_USER_MEMBERSHIPS.UPDATE.namespaceSlug),
        membershipId: z.string().trim().describe(NAMESPACE_USER_MEMBERSHIPS.UPDATE.membershipId)
      }),
      body: z.object({
        roles: z
          .array(
            z.discriminatedUnion("isTemporary", [
              z.object({
                role: z.string().trim(),
                isTemporary: z.literal(false).optional()
              }),
              z.object({
                role: z.string().trim(),
                isTemporary: z.literal(true),
                temporaryMode: z.nativeEnum(NamespaceUserMembershipTemporaryMode),
                temporaryRange: z.string().refine((val) => ms(val) > 0, "Invalid time range"),
                temporaryAccessStartTime: z.string().datetime()
              })
            ])
          )
          .describe(NAMESPACE_USER_MEMBERSHIPS.UPDATE.roles)
      }),
      response: {
        200: z.object({
          roles: NamespaceMembershipRolesSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const roles = await server.services.namespaceUserMembership.updateNamespaceMembership({
        permission: req.permission,
        namespaceSlug: req.params.namespaceSlug,
        membershipId: req.params.membershipId,
        roles: req.body.roles
      });
      return { roles };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:namespaceSlug/memberships/:membershipId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceUserMemberships],
      description: "Delete namespace user membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceSlug: slugSchema().describe(NAMESPACE_USER_MEMBERSHIPS.DELETE.namespaceSlug),
        membershipId: z.string().trim().describe(NAMESPACE_USER_MEMBERSHIPS.DELETE.membershipId)
      }),
      response: {
        200: z.object({
          membership: NamespaceMembershipsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.namespaceUserMembership.deleteNamespaceMembership({
        permission: req.permission,
        namespaceSlug: req.params.namespaceSlug,
        membershipId: req.params.membershipId
      });
      return { membership };
    }
  });

  server.route({
    method: "POST",
    url: "/:namespaceName/memberships",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceUserMemberships],
      description: "Add users to namespace",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceName: slugSchema().describe(NAMESPACE_USER_MEMBERSHIPS.ADD_USER.namespaceSlug)
      }),
      body: z.object({
        usernames: z.array(z.string().trim()).describe(NAMESPACE_USER_MEMBERSHIPS.ADD_USER.usernames),
        roleSlugs: z.array(z.string().trim()).describe(NAMESPACE_USER_MEMBERSHIPS.ADD_USER.roleSlugs)
      }),
      response: {
        200: z.object({
          message: z.string(),
          completeInviteLinks: z
            .array(
              z.object({
                email: z.string(),
                link: z.string()
              })
            )
            .optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { users = [], signupTokens: completeInviteLinks } = await server.services.org.inviteUserToOrganization({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        inviteeEmails: req.body.usernames,
        organizationRoleSlug: OrgMembershipRole.NoAccess,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      await server.services.namespaceUserMembership.addUserToNamespace({
        namespaceSlug: req.params.namespaceName,
        permission: req.permission,
        roleSlugs: req.body.roleSlugs,
        validatedUsers: users
      });
      return { completeInviteLinks, message: "Successfully invited users to namespace" };
    }
  });
};
