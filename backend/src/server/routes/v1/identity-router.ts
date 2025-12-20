import { z } from "zod";

import { IdentitiesSchema, IdentityOrgMembershipsSchema, OrgMembershipRole, OrgRolesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, IDENTITIES } from "@app/lib/api-docs";
import { buildSearchZodSchema, SearchResourceOperators } from "@app/lib/search-resource/search";
import { OrderByDirection } from "@app/lib/types";
import { CharacterType, zodValidateCharacters } from "@app/lib/validator/validate-string";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { OrgIdentityOrderBy } from "@app/services/identity/identity-types";
import { isSuperAdmin } from "@app/services/super-admin/super-admin-fns";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { SanitizedProjectSchema } from "../sanitizedSchemas";

const searchResourceZodValidate = zodValidateCharacters([
  CharacterType.AlphaNumeric,
  CharacterType.Spaces,
  CharacterType.Underscore,
  CharacterType.Hyphen,
  CharacterType.ForwardSlash
  // TODO: scott - adding forwardslash for quick fix but we don't constrain identity name creation - not sure why we added this but we should evaluate if needed and if so make consistent with
  // the actual name limitations
]);

export const registerIdentityRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Identities],
      description: "Create machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        name: z.string().trim().describe(IDENTITIES.CREATE.name),
        organizationId: z.string().trim().describe(IDENTITIES.CREATE.organizationId),
        role: z.string().trim().min(1).default(OrgMembershipRole.NoAccess).describe(IDENTITIES.CREATE.role),
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
      const identity = await server.services.identityV1.createIdentity({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        orgId: req.body.organizationId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.body.organizationId,
        event: {
          type: EventType.CREATE_IDENTITY,
          metadata: {
            name: identity.name,
            hasDeleteProtection: identity.hasDeleteProtection,
            identityId: identity.id
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.MachineIdentityCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.body.organizationId,
          name: identity.name,
          hasDeleteProtection: identity.hasDeleteProtection,
          identityId: identity.id,
          ...req.auditLogInfo
        }
      });

      return { identity };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Identities],
      description: "Update machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(IDENTITIES.UPDATE.identityId)
      }),
      body: z.object({
        name: z.string().trim().optional().describe(IDENTITIES.UPDATE.name),
        role: z.string().trim().min(1).optional().describe(IDENTITIES.UPDATE.role),
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
      const identity = await server.services.identityV1.updateIdentity({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.identityId,
        isActorSuperAdmin: isSuperAdmin(req.auth),
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
            identityId: identity.id
          }
        }
      });

      return { identity };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Identities],
      description: "Delete machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(IDENTITIES.DELETE.identityId)
      }),
      response: {
        200: z.object({
          identity: IdentitiesSchema
        })
      }
    },
    handler: async (req) => {
      const identity = await server.services.identityV1.deleteIdentity({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.identityId,
        isActorSuperAdmin: isSuperAdmin(req.auth)
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identity.orgId,
        event: {
          type: EventType.DELETE_IDENTITY,
          metadata: {
            identityId: identity.id
          }
        }
      });
      return { identity };
    }
  });

  server.route({
    method: "GET",
    url: "/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Identities],
      description: "Get a machine identity by id",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(IDENTITIES.GET_BY_ID.identityId)
      }),
      response: {
        200: z.object({
          identity: IdentityOrgMembershipsSchema.extend({
            metadata: z
              .object({
                id: z.string().trim().min(1),
                key: z.string().trim().min(1),
                value: z.string().trim().min(1)
              })
              .array()
              .optional(),
            customRole: OrgRolesSchema.pick({
              id: true,
              name: true,
              slug: true,
              permissions: true,
              description: true
            }).optional(),
            identity: IdentitiesSchema.pick({ name: true, id: true, hasDeleteProtection: true, orgId: true }).extend({
              authMethods: z.array(z.string()),
              activeLockoutAuthMethods: z.array(z.string())
            })
          })
        })
      }
    },
    handler: async (req) => {
      const identity = await server.services.identityV1.getIdentityById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.identityId
      });

      return { identity };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Identities],
      description: "List machine identities",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        orgId: z.string().describe(IDENTITIES.LIST.orgId)
      }),
      response: {
        200: z.object({
          identities: IdentityOrgMembershipsSchema.extend({
            customRole: OrgRolesSchema.pick({
              id: true,
              name: true,
              slug: true,
              permissions: true,
              description: true
            }).optional(),
            identity: IdentitiesSchema.pick({ name: true, id: true, hasDeleteProtection: true }).extend({
              authMethods: z.array(z.string())
            })
          }).array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { identityMemberships, totalCount } = await server.services.identityV1.listOrgIdentities({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.query.orgId
      });

      return { identities: identityMemberships, totalCount };
    }
  });

  server.route({
    method: "POST",
    url: "/search",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Identities],
      description: "Search machine identities",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        orderBy: z
          .nativeEnum(OrgIdentityOrderBy)
          .default(OrgIdentityOrderBy.Name)
          .describe(IDENTITIES.SEARCH.orderBy)
          .optional(),
        orderDirection: z
          .nativeEnum(OrderByDirection)
          .default(OrderByDirection.ASC)
          .describe(IDENTITIES.SEARCH.orderDirection)
          .optional(),
        limit: z.number().max(100).default(50).describe(IDENTITIES.SEARCH.limit),
        offset: z.number().default(0).describe(IDENTITIES.SEARCH.offset),
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
                .describe(IDENTITIES.SEARCH.search.name),
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
                .describe(IDENTITIES.SEARCH.search.role)
            })
            .describe(IDENTITIES.SEARCH.search.desc)
            .partial()
        )
      }),
      response: {
        200: z.object({
          identities: IdentityOrgMembershipsSchema.extend({
            customRole: OrgRolesSchema.pick({
              id: true,
              name: true,
              slug: true,
              permissions: true,
              description: true
            }).optional(),
            identity: IdentitiesSchema.pick({ name: true, id: true, hasDeleteProtection: true, orgId: true }).extend({
              authMethods: z.array(z.string())
            })
          }).array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { identityMemberships, totalCount } = await server.services.identityV1.searchOrgIdentities({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        searchFilter: req.body.search,
        orgId: req.permission.orgId,
        limit: req.body.limit,
        offset: req.body.offset,
        orderBy: req.body.orderBy,
        orderDirection: req.body.orderDirection
      });

      return { identities: identityMemberships, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:identityId/identity-memberships",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "List project memberships that machine identity with id is part of",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(IDENTITIES.GET_BY_ID.identityId)
      }),
      response: {
        200: z.object({
          identityMemberships: z.array(
            z.object({
              id: z.string(),
              identityId: z.string(),
              createdAt: z.date(),
              updatedAt: z.date(),
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
              identity: IdentitiesSchema.pick({ name: true, id: true, hasDeleteProtection: true }).extend({
                authMethods: z.array(z.string())
              }),
              project: SanitizedProjectSchema.pick({ name: true, id: true, type: true })
            })
          )
        })
      }
    },
    handler: async (req) => {
      const identityMemberships = await server.services.identityV1.listProjectIdentitiesByIdentityId({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId
      });

      return { identityMemberships };
    }
  });

  server.route({
    method: "GET",
    url: "/details",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          identityDetails: z.object({
            organization: z.object({
              id: z.string(),
              name: z.string(),
              slug: z.string()
            })
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN], { requireOrg: false }),
    handler: async (req) => {
      const organization = await server.services.org.findIdentityOrganization(req.permission.id);
      return { identityDetails: { organization } };
    }
  });
};
