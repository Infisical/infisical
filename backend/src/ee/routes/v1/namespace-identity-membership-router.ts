import { z } from "zod";

import { IdentitiesSchema, NamespaceMembershipRolesSchema, NamespaceMembershipsSchema } from "@app/db/schemas";
import { NamespaceIdentityMembershipOrderBy } from "@app/ee/services/namespace-identity-membership/namespace-identity-membership-types";
import { NamespaceUserMembershipTemporaryMode } from "@app/ee/services/namespace-user-membership/namespace-user-membership-types";
import { ApiDocsTags, NAMESPACE_IDENTITY_MEMBERSHIPS } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { OrderByDirection } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SanitizedNamespaceIdentityMembershipSchema = NamespaceMembershipsSchema.extend({
  identity: IdentitiesSchema.pick({
    id: true,
    name: true
  }).extend({
    authMethods: z.array(z.string()),
    hasDeleteProtection: z.boolean(),
    lastLoginAuthMethod: z.string().nullable().optional(),
    lastLoginTime: z.date().nullable().optional()
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
  ),
  metadata: z.object({ id: z.string(), key: z.string(), value: z.string() }).array()
});

export const registerNamespaceIdentityMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:namespaceSlug/identity-memberships/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentityMemberships],
      description: "Create namespace identity membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceSlug: slugSchema().describe(NAMESPACE_IDENTITY_MEMBERSHIPS.CREATE_IDENTITY_MEMBERSHIP.namespaceSlug),
        identityId: z.string().trim().describe(NAMESPACE_IDENTITY_MEMBERSHIPS.CREATE_IDENTITY_MEMBERSHIP.identityId)
      }),
      body: z.object({
        roles: z
          .array(
            z.discriminatedUnion("isTemporary", [
              z.object({
                role: z.string().describe(NAMESPACE_IDENTITY_MEMBERSHIPS.CREATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(false)
                  .default(false)
                  .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.CREATE_IDENTITY_MEMBERSHIP.roles.isTemporary)
              }),
              z.object({
                role: z.string().describe(NAMESPACE_IDENTITY_MEMBERSHIPS.CREATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(true)
                  .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.CREATE_IDENTITY_MEMBERSHIP.roles.isTemporary),
                temporaryMode: z
                  .nativeEnum(NamespaceUserMembershipTemporaryMode)
                  .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.CREATE_IDENTITY_MEMBERSHIP.roles.temporaryMode),
                temporaryRange: z
                  .string()
                  .refine((val) => ms(val) > 0, "Temporary range must be a positive number")
                  .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.CREATE_IDENTITY_MEMBERSHIP.roles.temporaryRange),
                temporaryAccessStartTime: z
                  .string()
                  .datetime()
                  .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.CREATE_IDENTITY_MEMBERSHIP.roles.temporaryAccessStartTime)
              })
            ])
          )
          .min(1)
          .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.CREATE_IDENTITY_MEMBERSHIP.roles.description)
      }),
      response: {
        200: z.object({
          identityMembership: NamespaceMembershipsSchema
        })
      }
    },
    handler: async (req) => {
      const identityMembership = await server.services.namespaceIdentityMembership.createNamespaceIdentityMembership({
        identityId: req.params.identityId,
        roles: req.body.roles,
        permission: {
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          namespaceName: req.params.namespaceSlug
        }
      });
      return { identityMembership };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:namespaceSlug/identity-memberships/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentityMemberships],
      description: "Update namespace identity membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceSlug: slugSchema().describe(NAMESPACE_IDENTITY_MEMBERSHIPS.UPDATE_IDENTITY_MEMBERSHIP.namespaceSlug),
        identityId: z.string().trim().describe(NAMESPACE_IDENTITY_MEMBERSHIPS.UPDATE_IDENTITY_MEMBERSHIP.identityId)
      }),
      body: z.object({
        roles: z
          .array(
            z.discriminatedUnion("isTemporary", [
              z.object({
                role: z.string().describe(NAMESPACE_IDENTITY_MEMBERSHIPS.UPDATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(false)
                  .default(false)
                  .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.UPDATE_IDENTITY_MEMBERSHIP.roles.isTemporary)
              }),
              z.object({
                role: z.string().describe(NAMESPACE_IDENTITY_MEMBERSHIPS.UPDATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(true)
                  .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.UPDATE_IDENTITY_MEMBERSHIP.roles.isTemporary),
                temporaryMode: z
                  .nativeEnum(NamespaceUserMembershipTemporaryMode)
                  .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.UPDATE_IDENTITY_MEMBERSHIP.roles.temporaryMode),
                temporaryRange: z
                  .string()
                  .refine((val) => ms(val) > 0, "Temporary range must be a positive number")
                  .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.UPDATE_IDENTITY_MEMBERSHIP.roles.temporaryRange),
                temporaryAccessStartTime: z
                  .string()
                  .datetime()
                  .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.UPDATE_IDENTITY_MEMBERSHIP.roles.temporaryAccessStartTime)
              })
            ])
          )
          .min(1)
          .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.UPDATE_IDENTITY_MEMBERSHIP.roles.description)
      }),
      response: {
        200: z.object({
          roles: NamespaceMembershipRolesSchema.array()
        })
      }
    },
    handler: async (req) => {
      const roles = await server.services.namespaceIdentityMembership.updateNamespaceIdentityMembership({
        identityId: req.params.identityId,
        roles: req.body.roles,
        permission: {
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          namespaceName: req.params.namespaceSlug
        }
      });
      return { roles };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:namespaceSlug/identity-memberships/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentityMemberships],
      description: "Delete namespace identity membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceSlug: slugSchema().describe(NAMESPACE_IDENTITY_MEMBERSHIPS.DELETE_IDENTITY_MEMBERSHIP.namespaceSlug),
        identityId: z.string().trim().describe(NAMESPACE_IDENTITY_MEMBERSHIPS.DELETE_IDENTITY_MEMBERSHIP.identityId)
      }),
      response: {
        200: z.object({
          identityMembership: NamespaceMembershipsSchema
        })
      }
    },
    handler: async (req) => {
      const identityMembership = await server.services.namespaceIdentityMembership.deleteNamespaceIdentityMembership({
        identityId: req.params.identityId,
        permission: {
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          namespaceName: req.params.namespaceSlug
        }
      });
      return { identityMembership };
    }
  });

  server.route({
    method: "GET",
    url: "/:namespaceSlug/identity-memberships",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentityMemberships],
      description: "List namespace identity memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceSlug: slugSchema().describe(NAMESPACE_IDENTITY_MEMBERSHIPS.LIST_IDENTITY_MEMBERSHIPS.namespaceSlug)
      }),
      querystring: z.object({
        offset: z.coerce
          .number()
          .min(0)
          .default(0)
          .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.LIST_IDENTITY_MEMBERSHIPS.offset)
          .optional(),
        limit: z.coerce
          .number()
          .min(1)
          .max(20000)
          .default(50)
          .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.LIST_IDENTITY_MEMBERSHIPS.limit)
          .optional(),
        orderBy: z
          .nativeEnum(NamespaceIdentityMembershipOrderBy)
          .default(NamespaceIdentityMembershipOrderBy.Name)
          .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.LIST_IDENTITY_MEMBERSHIPS.orderBy)
          .optional(),
        orderDirection: z
          .nativeEnum(OrderByDirection)
          .default(OrderByDirection.ASC)
          .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.LIST_IDENTITY_MEMBERSHIPS.orderDirection)
          .optional(),
        search: z.string().trim().describe(NAMESPACE_IDENTITY_MEMBERSHIPS.LIST_IDENTITY_MEMBERSHIPS.search).optional()
      }),
      response: {
        200: z.object({
          identityMemberships: SanitizedNamespaceIdentityMembershipSchema.array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { identityMemberships, totalCount } =
        await server.services.namespaceIdentityMembership.listNamespaceIdentityMemberships({
          limit: req.query.limit,
          offset: req.query.offset,
          orderBy: req.query.orderBy,
          orderDirection: req.query.orderDirection,
          search: req.query.search,
          permission: {
            actor: req.permission.type,
            actorId: req.permission.id,
            actorAuthMethod: req.permission.authMethod,
            actorOrgId: req.permission.orgId,
            namespaceName: req.params.namespaceSlug
          }
        });

      return { identityMemberships, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:namespaceSlug/identity-memberships/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentityMemberships],
      description: "Get namespace identity membership by identity ID",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceSlug: slugSchema().describe(
          NAMESPACE_IDENTITY_MEMBERSHIPS.GET_IDENTITY_MEMBERSHIP_BY_ID.namespaceSlug
        ),
        identityId: z.string().trim().describe(NAMESPACE_IDENTITY_MEMBERSHIPS.GET_IDENTITY_MEMBERSHIP_BY_ID.identityId)
      }),
      response: {
        200: z.object({
          identityMembership: SanitizedNamespaceIdentityMembershipSchema
        })
      }
    },
    handler: async (req) => {
      const identityMembership =
        await server.services.namespaceIdentityMembership.getNamespaceIdentityMembershipByIdentityId({
          identityId: req.params.identityId,
          permission: {
            actor: req.permission.type,
            actorId: req.permission.id,
            actorAuthMethod: req.permission.authMethod,
            actorOrgId: req.permission.orgId,
            namespaceName: req.params.namespaceSlug
          }
        });
      return { identityMembership };
    }
  });
};
