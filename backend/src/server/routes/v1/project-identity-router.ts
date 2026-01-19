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
  activeLockoutAuthMethods: z.string().array().optional(),
  authMethods: z.string().array().optional(),
  metadata: z
    .object({
      key: z.string(),
      value: z.string(),
      id: z.string()
    })
    .array()
    .optional()
});

export const registerProjectIdentityRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectId/identities",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "createProjectMachineIdentity",
      tags: [ApiDocsTags.Identities],
      description: "Create an identity in a project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe("The ID of the project to create the identity in")
      }),
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
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        data: {
          name: req.body.name,
          hasDeleteProtection: req.body.hasDeleteProtection,
          metadata: req.body.metadata
        }
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.params.projectId,
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
    url: "/:projectId/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "updateProjectMachineIdentity",
      tags: [ApiDocsTags.Identities],
      description: "Update an identity in a project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe("The ID of the project"),
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
          scope: AccessScope.Project,
          projectId: req.params.projectId,
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
        projectId: req.params.projectId,
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
    url: "/:projectId/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "deleteProjectMachineIdentity",
      tags: [ApiDocsTags.Identities],
      description: "Delete an identity from a project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe("The ID of the project"),
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
          orgId: req.permission.orgId,
          scope: AccessScope.Project,
          projectId: req.params.projectId
        },
        selector: {
          identityId: req.params.identityId
        }
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.params.projectId,
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
    url: "/:projectId/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getProjectMachineIdentityById",
      tags: [ApiDocsTags.Identities],
      description: "Get an identity by ID in a project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe("The ID of the project"),
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
          orgId: req.permission.orgId,
          scope: AccessScope.Project,
          projectId: req.params.projectId
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
    url: "/:projectId/identities",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "listProjectMachineIdentities",
      tags: [ApiDocsTags.Identities],
      description: "List identities in a project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe("The ID of the project")
      }),
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
          orgId: req.permission.orgId,
          scope: AccessScope.Project,
          projectId: req.params.projectId
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
