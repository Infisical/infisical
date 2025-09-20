import { z } from "zod";

import { IdentitiesSchema, NamespaceMembershipsSchema, OrgMembershipRole } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  NamespaceIdentityMembershipOrderBy,
  NamespaceIdentityOrderBy
} from "@app/ee/services/namespace-identity-membership/namespace-identity-membership-types";
import { ApiDocsTags, IDENTITIES, NAMESPACE_IDENTITY_MEMBERSHIPS } from "@app/lib/api-docs";
import { buildSearchZodSchema, SearchResourceOperators } from "@app/lib/search-resource/search";
import { OrderByDirection } from "@app/lib/types";
import { CharacterType, zodValidateCharacters } from "@app/lib/validator/validate-string";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const searchResourceZodValidate = zodValidateCharacters([
  CharacterType.AlphaNumeric,
  CharacterType.Spaces,
  CharacterType.Underscore,
  CharacterType.Hyphen
]);

const SanitizedNamespaceIdentityMembershipSchema = NamespaceMembershipsSchema.extend({
  identity: IdentitiesSchema.pick({
    id: true,
    name: true
  }).extend({
    authMethods: z.array(z.string()),
    hasDeleteProtection: z.boolean()
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

export const registerNamespaceIdentityRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:namespaceSlug/identities",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentityMemberships],
      description: "Create namespace identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceSlug: slugSchema().describe("The slug of the namespace to create the identity in.")
      }),
      body: z.object({
        name: z.string().trim().describe(IDENTITIES.CREATE.name),
        hasDeleteProtection: z.boolean().default(false).describe(IDENTITIES.CREATE.hasDeleteProtection),
        metadata: z
          .object({ key: z.string().trim().min(1), value: z.string().trim().min(1) })
          .array()
          .optional()
      }),
      response: {
        200: z.object({
          identity: IdentitiesSchema.extend({
            authMethods: z.array(z.string()),
            metadata: z.object({ id: z.string(), key: z.string(), value: z.string() }).array()
          })
        })
      }
    },
    handler: async (req) => {
      const identity = await server.services.identity.createIdentity({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name: req.body.name,
        role: OrgMembershipRole.NoAccess,
        hasDeleteProtection: req.body.hasDeleteProtection,
        metadata: req.body.metadata,
        namespaceSlug: req.params.namespaceSlug,
        orgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.CREATE_IDENTITY,
          metadata: {
            name: identity.name,
            hasDeleteProtection: identity.hasDeleteProtection,
            identityId: identity.id,
            namespaceSlug: req.params.namespaceSlug
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.MachineIdentityCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.permission.orgId,
          name: identity.name,
          hasDeleteProtection: identity.hasDeleteProtection,
          identityId: identity.id,
          namespaceSlug: req.params.namespaceSlug,
          ...req.auditLogInfo
        }
      });

      return { identity };
    }
  });

  server.route({
    method: "POST",
    url: "/:namespaceSlug/identities/search",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentityMemberships],
      description: "Search namespace identities",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceSlug: slugSchema().describe(NAMESPACE_IDENTITY_MEMBERSHIPS.SEARCH.namespaceSlug)
      }),
      body: z.object({
        orderBy: z
          .nativeEnum(NamespaceIdentityOrderBy)
          .default(NamespaceIdentityOrderBy.Name)
          .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.SEARCH.orderBy)
          .optional(),
        orderDirection: z
          .nativeEnum(OrderByDirection)
          .default(OrderByDirection.ASC)
          .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.SEARCH.orderDirection)
          .optional(),
        limit: z.number().max(100).default(50).describe(NAMESPACE_IDENTITY_MEMBERSHIPS.SEARCH.limit),
        offset: z.number().default(0).describe(NAMESPACE_IDENTITY_MEMBERSHIPS.SEARCH.offset),
        search: buildSearchZodSchema(
          z
            .object({
              name: z
                .union([
                  searchResourceZodValidate(z.string().max(255), "Name"),
                  z
                    .object({
                      [SearchResourceOperators.$eq]: searchResourceZodValidate(z.string().max(255), "Name $eq"),
                      [SearchResourceOperators.$contains]: searchResourceZodValidate(
                        z.string().max(255),
                        "Name $contains"
                      ),
                      [SearchResourceOperators.$in]: searchResourceZodValidate(z.string().max(255), "Name $in").array()
                    })
                    .partial()
                ])
                .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.SEARCH.search.name),
              role: z
                .union([
                  searchResourceZodValidate(z.string().max(255), "Role"),
                  z
                    .object({
                      [SearchResourceOperators.$eq]: searchResourceZodValidate(z.string().max(255), "Role $eq"),
                      [SearchResourceOperators.$in]: searchResourceZodValidate(z.string().max(255), "Role $in").array()
                    })
                    .partial()
                ])
                .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.SEARCH.search.role)
            })
            .describe(NAMESPACE_IDENTITY_MEMBERSHIPS.SEARCH.search.desc)
            .partial()
        )
      }),
      response: {
        200: z.object({
          identities: SanitizedNamespaceIdentityMembershipSchema.array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { identityMemberships, totalCount } =
        await server.services.namespaceIdentityMembership.searchNamespaceIdentities({
          searchFilter: req.body.search,
          limit: req.body.limit,
          offset: req.body.offset,
          orderBy: req.body.orderBy,
          orderDirection: req.body.orderDirection,
          permission: {
            actor: req.permission.type,
            actorId: req.permission.id,
            actorAuthMethod: req.permission.authMethod,
            actorOrgId: req.permission.orgId,
            namespaceSlug: req.params.namespaceSlug
          }
        });

      return { identities: identityMemberships, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:namespaceSlug/identities",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentityMemberships],
      description: "List namespace identities",
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
          .max(100)
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
            namespaceSlug: req.params.namespaceSlug
          }
        });

      return { identityMemberships, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:namespaceSlug/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentityMemberships],
      description: "Get namespace identity by ID",
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
            namespaceSlug: req.params.namespaceSlug
          }
        });
      return { identityMembership };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:namespaceSlug/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentityMemberships],
      description: "Update namespace identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceSlug: slugSchema().describe("The slug of the namespace."),
        identityId: z.string().describe(IDENTITIES.UPDATE.identityId)
      }),
      body: z.object({
        name: z.string().trim().optional().describe(IDENTITIES.UPDATE.name),
        hasDeleteProtection: z.boolean().optional().describe(IDENTITIES.UPDATE.hasDeleteProtection),
        metadata: z
          .object({ key: z.string().trim().min(1), value: z.string().trim().min(1) })
          .array()
          .optional()
      }),
      response: {
        200: z.object({
          identity: IdentitiesSchema.extend({
            metadata: z.object({ id: z.string(), key: z.string(), value: z.string() }).array()
          })
        })
      }
    },
    handler: async (req) => {
      const identity = await server.services.identity.updateIdentity({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.identityId,
        namespaceSlug: req.params.namespaceSlug,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identity.orgId,
        event: {
          type: EventType.UPDATE_IDENTITY,
          metadata: {
            name: identity.name,
            hasDeleteProtection: identity.hasDeleteProtection,
            identityId: identity.id,
            namespaceSlug: req.params.namespaceSlug
          }
        }
      });

      return { identity };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:namespaceSlug/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentityMemberships],
      description: "Delete namespace identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceSlug: slugSchema().describe("The slug of the namespace."),
        identityId: z.string().describe(IDENTITIES.DELETE.identityId)
      }),
      response: {
        200: z.object({
          identity: IdentitiesSchema
        })
      }
    },
    handler: async (req) => {
      const identity = await server.services.identity.deleteIdentity({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.identityId,
        namespaceSlug: req.params.namespaceSlug
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identity.orgId,
        event: {
          type: EventType.DELETE_IDENTITY,
          metadata: {
            identityId: identity.id,
            namespaceSlug: req.params.namespaceSlug
          }
        }
      });
      return { identity };
    }
  });
};
