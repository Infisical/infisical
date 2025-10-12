import { z } from "zod";

import { AccessScope, IdentitiesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, NAMESPACE_IDENTITIES } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const SanitizedNamespaceIdentitySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  hasDeleteProtection: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  metadata: z.object({ id: z.string(), key: z.string(), value: z.string() }).array()
});

export const registerNamespaceIdentityRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:namespaceId/identities",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentities],
      description: "Create namespace scoped identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceId: z.string().trim().describe(NAMESPACE_IDENTITIES.CREATE.namespaceId)
      }),
      body: z.object({
        name: z.string().trim().describe(NAMESPACE_IDENTITIES.CREATE.name),
        hasDeleteProtection: z.boolean().default(false).describe(NAMESPACE_IDENTITIES.CREATE.hasDeleteProtection),
        metadata: z
          .object({ key: z.string().trim().min(1), value: z.string().trim().min(1) })
          .array()
          .optional()
      }),
      response: {
        200: z.object({
          identity: SanitizedNamespaceIdentitySchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { identity } = await server.services.scopedIdentity.createIdentity({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          orgId: req.permission.orgId,
          namespaceId: req.params.namespaceId
        },
        data: {
          name: req.body.name,
          hasDeleteProtection: req.body.hasDeleteProtection,
          metadata: req.body.metadata
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        namespaceId: req.params.namespaceId,
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
        namespaceId: req.params.namespaceId,
        properties: {
          orgId: req.permission.orgId,
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
    url: "/:namespaceId/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentities],
      description: "Update namespace scoped identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceId: z.string().trim().describe(NAMESPACE_IDENTITIES.UPDATE.namespaceId),
        identityId: z.string().trim().describe(NAMESPACE_IDENTITIES.UPDATE.identityId)
      }),
      body: z.object({
        name: z.string().trim().optional().describe(NAMESPACE_IDENTITIES.UPDATE.name),
        hasDeleteProtection: z.boolean().optional().describe(NAMESPACE_IDENTITIES.UPDATE.hasDeleteProtection),
        metadata: z
          .object({ key: z.string().trim().min(1), value: z.string().trim().min(1) })
          .array()
          .optional()
      }),
      response: {
        200: z.object({
          identity: SanitizedNamespaceIdentitySchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { identity } = await server.services.scopedIdentity.updateIdentity({
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
          name: req.body.name,
          hasDeleteProtection: req.body.hasDeleteProtection,
          metadata: req.body.metadata
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        namespaceId: req.params.namespaceId,
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
    url: "/:namespaceId/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentities],
      description: "Delete namespace scoped identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceId: z.string().trim().describe(NAMESPACE_IDENTITIES.DELETE.namespaceId),
        identityId: z.string().trim().describe(NAMESPACE_IDENTITIES.DELETE.identityId)
      }),
      response: {
        200: z.object({
          identity: IdentitiesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { identity } = await server.services.scopedIdentity.deleteIdentity({
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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        namespaceId: req.params.namespaceId,
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
    url: "/:namespaceId/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentities],
      description: "Get namespace scoped identity by id",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceId: z.string().trim().describe(NAMESPACE_IDENTITIES.GET_BY_ID.namespaceId),
        identityId: z.string().trim().describe(NAMESPACE_IDENTITIES.GET_BY_ID.identityId)
      }),
      response: {
        200: z.object({
          identity: SanitizedNamespaceIdentitySchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { identity } = await server.services.scopedIdentity.getIdentityById({
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

      return { identity };
    }
  });

  server.route({
    method: "GET",
    url: "/:namespaceId/identities",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.NamespaceIdentities],
      description: "List namespace scoped identities",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        namespaceId: z.string().trim().describe(NAMESPACE_IDENTITIES.LIST.namespaceId)
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0).describe(NAMESPACE_IDENTITIES.LIST.offset).optional(),
        limit: z.coerce.number().min(1).max(100).default(20).describe(NAMESPACE_IDENTITIES.LIST.limit).optional(),
        search: z.string().trim().describe(NAMESPACE_IDENTITIES.LIST.search).optional()
      }),
      response: {
        200: z.object({
          identities: SanitizedNamespaceIdentitySchema.array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { identities } = await server.services.scopedIdentity.listIdentities({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Namespace,
          orgId: req.permission.orgId,
          namespaceId: req.params.namespaceId
        },
        data: {
          limit: req.query.limit,
          offset: req.query.offset,
          search: req.query.search
        }
      });

      return { identities: identities.docs, totalCount: identities.count };
    }
  });
};
