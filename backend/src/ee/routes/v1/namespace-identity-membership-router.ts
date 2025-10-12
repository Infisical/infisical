import { z } from "zod";

import { AccessScope, IdentitiesSchema, TemporaryPermissionMode } from "@app/db/schemas";
import { ApiDocsTags, NAMESPACE_IDENTITIES } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const SanitizedNamespaceIdentityMembershipDetailSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
  identityId: z.string().uuid(),
  namespaceId: z.string(),
  identity: IdentitiesSchema.pick({ name: true, id: true }).extend({
    authMethods: z.array(z.string())
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

export const SanitizedNamespaceIdentityMembershipSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
  identityId: z.string().uuid(),
  namespaceId: z.string()
});

export const registerNamespaceIdentityMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:namespaceId/identity-memberships",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentities],
      description: "Return namespace identity memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceId: z.string().trim().describe(NAMESPACE_IDENTITIES.LIST_IDENTITY_MEMBERSHIPS.namespaceId)
      }),
      querystring: z.object({
        offset: z.coerce
          .number()
          .min(0)
          .default(0)
          .describe(NAMESPACE_IDENTITIES.LIST_IDENTITY_MEMBERSHIPS.offset)
          .optional(),
        limit: z.coerce
          .number()
          .min(1)
          .max(100)
          .default(20)
          .describe(NAMESPACE_IDENTITIES.LIST_IDENTITY_MEMBERSHIPS.limit)
          .optional(),
        identityName: z
          .string()
          .trim()
          .describe(NAMESPACE_IDENTITIES.LIST_IDENTITY_MEMBERSHIPS.identityName)
          .optional(),
        roles: z
          .string()
          .trim()
          .transform((val) => (val ? val.split(",") : []))
          .describe(NAMESPACE_IDENTITIES.LIST_IDENTITY_MEMBERSHIPS.roles)
          .optional()
      }),
      response: {
        200: z.object({
          data: SanitizedNamespaceIdentityMembershipDetailSchema.extend({
            identity: SanitizedNamespaceIdentityMembershipDetailSchema.shape.identity.omit({ authMethods: true })
          }).array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { data, totalCount } = await server.services.membershipIdentity.listMemberships({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          orgId: req.permission.orgId,
          namespaceId: req.params.namespaceId
        },
        selector: {
          identityId: "" // This is required by the type but not used in list operation
        },
        data: {
          limit: req.query.limit,
          offset: req.query.offset,
          identityName: req.query.identityName,
          roles: req.query.roles || []
        }
      });

      return {
        data: data.map((el) => ({
          ...el,
          identityId: el.actorIdentityId as string,
          namespaceId: req.params.namespaceId
        })),
        totalCount
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:namespaceId/identity-memberships/:identityId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Return namespace identity membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceId: z.string().min(1).trim().describe(NAMESPACE_IDENTITIES.GET_IDENTITY_MEMBERSHIP_BY_ID.namespaceId),
        identityId: z.string().min(1).trim().describe(NAMESPACE_IDENTITIES.GET_IDENTITY_MEMBERSHIP_BY_ID.identityId)
      }),
      response: {
        200: z.object({
          membership: SanitizedNamespaceIdentityMembershipDetailSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.membershipIdentity.getMembershipByIdentityId({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          orgId: req.permission.orgId,
          namespaceId: req.params.namespaceId
        },
        selector: {
          identityId: req.params.identityId
        }
      });

      return {
        membership: {
          ...membership,
          identityId: req.params.identityId,
          namespaceId: req.params.namespaceId
        }
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:namespaceId/identity-memberships/:identityId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentities],
      description: "Create namespace identity membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceId: z.string().describe(NAMESPACE_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.namespaceId),
        identityId: z.string().describe(NAMESPACE_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.identityId)
      }),
      body: z.object({
        roles: z
          .array(
            z.union([
              z.object({
                role: z.string().describe(NAMESPACE_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(false)
                  .default(false)
                  .describe(NAMESPACE_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.roles.isTemporary)
              }),
              z.object({
                role: z.string().describe(NAMESPACE_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(true)
                  .describe(NAMESPACE_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.roles.isTemporary),
                temporaryMode: z
                  .nativeEnum(TemporaryPermissionMode)
                  .describe(NAMESPACE_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.roles.temporaryMode),
                temporaryRange: z
                  .string()
                  .refine((val) => ms(val) > 0, "Temporary range must be a positive number")
                  .describe(NAMESPACE_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.roles.temporaryRange),
                temporaryAccessStartTime: z
                  .string()
                  .datetime()
                  .describe(NAMESPACE_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.roles.temporaryAccessStartTime)
              })
            ])
          )
          .min(1)
          .refine((data) => data.some(({ isTemporary }) => !isTemporary), "At least one long lived role is required")
          .describe(NAMESPACE_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.roles.description)
      }),
      response: {
        200: z.object({
          membership: SanitizedNamespaceIdentityMembershipSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { membership } = await server.services.membershipIdentity.createMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          orgId: req.permission.orgId,
          namespaceId: req.params.namespaceId
        },
        data: {
          identityId: req.params.identityId,
          roles: req.body.roles
        }
      });

      return {
        membership: {
          ...membership,
          identityId: req.params.identityId,
          namespaceId: req.params.namespaceId
        }
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:namespaceId/identity-memberships/:identityId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentities],
      description: "Update namespace identity membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceId: z.string().trim().describe(NAMESPACE_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.namespaceId),
        identityId: z.string().trim().describe(NAMESPACE_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.identityId)
      }),
      body: z.object({
        roles: z
          .array(
            z.union([
              z.object({
                role: z.string().describe(NAMESPACE_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(false)
                  .default(false)
                  .describe(NAMESPACE_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.roles.isTemporary)
              }),
              z.object({
                role: z.string().describe(NAMESPACE_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(true)
                  .describe(NAMESPACE_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.roles.isTemporary),
                temporaryMode: z
                  .nativeEnum(TemporaryPermissionMode)
                  .describe(NAMESPACE_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.roles.temporaryMode),
                temporaryRange: z
                  .string()
                  .refine((val) => ms(val) > 0, "Temporary range must be a positive number")
                  .describe(NAMESPACE_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.roles.temporaryRange),
                temporaryAccessStartTime: z
                  .string()
                  .datetime()
                  .describe(NAMESPACE_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.roles.temporaryAccessStartTime)
              })
            ])
          )
          .min(1)
          .refine((data) => data.some(({ isTemporary }) => !isTemporary), "At least one long lived role is required")
          .describe(NAMESPACE_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.roles.description)
      }),
      response: {
        200: z.object({
          roles: SanitizedNamespaceIdentityMembershipDetailSchema.shape.roles
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { membership } = await server.services.membershipIdentity.updateMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          orgId: req.permission.orgId,
          namespaceId: req.params.namespaceId
        },
        selector: {
          identityId: req.params.identityId
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
    url: "/:namespaceId/identity-memberships/:identityId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Delete namespace identity membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceId: z.string().trim().describe(NAMESPACE_IDENTITIES.DELETE_IDENTITY_MEMBERSHIP.namespaceId),
        identityId: z.string().trim().describe(NAMESPACE_IDENTITIES.DELETE_IDENTITY_MEMBERSHIP.identityId)
      }),
      response: {
        200: z.object({
          membership: SanitizedNamespaceIdentityMembershipSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { membership } = await server.services.membershipIdentity.deleteMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          orgId: req.permission.orgId,
          namespaceId: req.params.namespaceId
        },
        selector: {
          identityId: req.params.identityId
        }
      });

      return {
        membership: {
          ...membership,
          identityId: req.params.identityId,
          namespaceId: req.params.namespaceId
        }
      };
    }
  });
};
