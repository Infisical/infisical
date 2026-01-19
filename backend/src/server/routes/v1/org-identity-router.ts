import { z } from "zod";

import { AccessScope, IdentitiesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, IDENTITIES } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const metadataSchema = z.object({
  key: z.string().trim().min(1, "Metadata key cannot be empty"),
  value: z.string().trim().min(1, "Metadata value cannot be empty")
});

const sanitizedIdentitySchema = IdentitiesSchema.pick({
  id: true,
  name: true,
  orgId: true,
  projectId: true,
  createdAt: true,
  updatedAt: true,
  hasDeleteProtection: true
}).extend({
  authMethods: z.array(z.string()).optional(),
  metadata: z.array(metadataSchema).optional()
});

export const registerOrgIdentityRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/identities",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      operationId: "createOrganizationMachineIdentity",
      tags: [ApiDocsTags.Identities],
      description: "Create an identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        name: z.string().trim().min(1).describe(IDENTITIES.CREATE.name),
        hasDeleteProtection: z.boolean().default(false).describe(IDENTITIES.CREATE.hasDeleteProtection),
        metadata: z.array(metadataSchema).optional().describe(IDENTITIES.CREATE.metadata)
      }),
      response: {
        200: z.object({
          identity: sanitizedIdentitySchema
        })
      }
    },
    handler: async (req) => {
      const { identity } = await server.services.identityV2.createIdentity({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
        },
        data: {
          name: req.body.name,
          hasDeleteProtection: req.body.hasDeleteProtection,
          metadata: req.body.metadata
        }
      });

      await server.services.auditLog.createAuditLog({
        orgId: req.permission.orgId,
        ...req.auditLogInfo,
        event: {
          type: EventType.CREATE_IDENTITY,
          metadata: {
            identityId: identity.id,
            name: req.body.name,
            hasDeleteProtection: req.body.hasDeleteProtection,
            metadata: req.body.metadata
          }
        }
      });

      return { identity };
    }
  });

  server.route({
    method: "PATCH",
    url: "/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      operationId: "updateOrganizationMachineIdentity",
      tags: [ApiDocsTags.Identities],
      description: "Update an identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(IDENTITIES.UPDATE.identityId)
      }),
      body: z.object({
        name: z.string().trim().min(1).optional().describe(IDENTITIES.UPDATE.name),
        hasDeleteProtection: z.boolean().optional().describe(IDENTITIES.UPDATE.hasDeleteProtection),
        metadata: z.array(metadataSchema).optional().describe(IDENTITIES.UPDATE.metadata)
      }),
      response: {
        200: z.object({
          identity: sanitizedIdentitySchema
        })
      }
    },
    handler: async (req) => {
      const { identity } = await server.services.identityV2.updateIdentity({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
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
        orgId: req.permission.orgId,
        ...req.auditLogInfo,
        event: {
          type: EventType.UPDATE_IDENTITY,
          metadata: {
            identityId: req.params.identityId,
            name: req.body.name,
            hasDeleteProtection: req.body.hasDeleteProtection,
            metadata: req.body.metadata
          }
        }
      });

      return { identity };
    }
  });

  server.route({
    method: "DELETE",
    url: "/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      operationId: "deleteOrganizationMachineIdentity",
      tags: [ApiDocsTags.Identities],
      description: "Delete an identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(IDENTITIES.DELETE.identityId)
      }),
      response: {
        200: z.object({
          identity: sanitizedIdentitySchema
        })
      }
    },
    handler: async (req) => {
      const { identity } = await server.services.identityV2.deleteIdentity({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
        },
        selector: {
          identityId: req.params.identityId
        }
      });

      await server.services.auditLog.createAuditLog({
        orgId: req.permission.orgId,
        ...req.auditLogInfo,
        event: {
          type: EventType.DELETE_IDENTITY,
          metadata: {
            identityId: req.params.identityId
          }
        }
      });

      return { identity };
    }
  });

  server.route({
    method: "GET",
    url: "/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      operationId: "getOrganizationMachineIdentityById",
      tags: [ApiDocsTags.Identities],
      description: "Get an identity by ID",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(IDENTITIES.GET_BY_ID.identityId)
      }),
      response: {
        200: z.object({
          identity: sanitizedIdentitySchema
        })
      }
    },
    handler: async (req) => {
      const { identity } = await server.services.identityV2.getIdentityById({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
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
    url: "/identities",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      operationId: "listOrganizationMachineIdentities",
      tags: [ApiDocsTags.Identities],
      description: "List identities",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0).describe(IDENTITIES.LIST.offset).optional(),
        limit: z.coerce.number().min(1).max(1000).default(20).describe(IDENTITIES.LIST.limit).optional(),
        search: z.string().trim().describe(IDENTITIES.LIST.search).optional()
      }),
      response: {
        200: z.object({
          identities: z.array(sanitizedIdentitySchema),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { docs: identities, count: totalCount } = await server.services.identityV2.listIdentities({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
        },
        data: {
          offset: req.query.offset,
          limit: req.query.limit,
          search: req.query.search
        }
      });

      return { identities, totalCount };
    }
  });
};
