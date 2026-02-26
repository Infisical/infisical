import { z } from "zod";

import { NhiIdentitiesSchema, NhiRemediationActionsSchema, NhiScansSchema, NhiSourcesSchema } from "@app/db/schemas";
import { NhiIdentityStatus, NhiRemediationActionType } from "@app/ee/services/nhi/nhi-enums";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerNhiRouter = async (server: FastifyZodProvider) => {
  // --- Sources ---

  server.route({
    method: "GET",
    url: "/sources",
    config: { rateLimit: readLimit },
    schema: {
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          sources: NhiSourcesSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const sources = await server.services.nhi.listSources({
        projectId: req.query.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { sources };
    }
  });

  server.route({
    method: "POST",
    url: "/sources",
    config: { rateLimit: writeLimit },
    schema: {
      body: z.object({
        projectId: z.string(),
        name: z.string().min(1).max(255),
        provider: z.string(),
        connectionId: z.string().uuid(),
        config: z.record(z.unknown()).optional()
      }),
      response: {
        200: z.object({
          source: NhiSourcesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const source = await server.services.nhi.createSource({
        projectId: req.body.projectId,
        name: req.body.name,
        provider: req.body.provider,
        connectionId: req.body.connectionId,
        config: req.body.config,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { source };
    }
  });

  server.route({
    method: "DELETE",
    url: "/sources/:sourceId",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({
        sourceId: z.string().uuid()
      }),
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          source: NhiSourcesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const source = await server.services.nhi.deleteSource({
        sourceId: req.params.sourceId,
        projectId: req.query.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { source };
    }
  });

  // --- Scans ---

  server.route({
    method: "POST",
    url: "/sources/:sourceId/scan",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({
        sourceId: z.string().uuid()
      }),
      body: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          scan: NhiScansSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { scan } = await server.services.nhi.triggerScan({
        sourceId: req.params.sourceId,
        projectId: req.body.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { scan };
    }
  });

  server.route({
    method: "GET",
    url: "/sources/:sourceId/scans",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({
        sourceId: z.string().uuid()
      }),
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          scans: NhiScansSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const scans = await server.services.nhi.listScans({
        sourceId: req.params.sourceId,
        projectId: req.query.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { scans };
    }
  });

  server.route({
    method: "GET",
    url: "/scans/:scanId",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({
        scanId: z.string().uuid()
      }),
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          scan: NhiScansSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const scan = await server.services.nhi.getScan({
        scanId: req.params.scanId,
        projectId: req.query.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { scan };
    }
  });

  // --- Identities ---

  server.route({
    method: "GET",
    url: "/identities",
    config: { rateLimit: readLimit },
    schema: {
      querystring: z.object({
        projectId: z.string(),
        search: z.string().optional(),
        riskLevel: z.string().optional(),
        type: z.string().optional(),
        sourceId: z.string().uuid().optional(),
        provider: z.string().optional(),
        status: z.string().optional(),
        ownerFilter: z.string().optional(),
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(50),
        sortBy: z.string().optional(),
        sortDir: z.enum(["asc", "desc"]).optional()
      }),
      response: {
        200: z.object({
          identities: NhiIdentitiesSchema.extend({
            sourceName: z.string().nullable().optional()
          }).array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { identities, totalCount } = await server.services.nhi.listIdentities({
        projectId: req.query.projectId,
        search: req.query.search,
        riskLevel: req.query.riskLevel,
        type: req.query.type,
        sourceId: req.query.sourceId,
        provider: req.query.provider,
        status: req.query.status,
        ownerFilter: req.query.ownerFilter,
        page: req.query.page,
        limit: req.query.limit,
        sortBy: req.query.sortBy,
        sortDir: req.query.sortDir,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { identities, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/identities/:identityId",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({
        identityId: z.string().uuid()
      }),
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          identity: NhiIdentitiesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const identity = await server.services.nhi.getIdentityById({
        identityId: req.params.identityId,
        projectId: req.query.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { identity };
    }
  });

  server.route({
    method: "PATCH",
    url: "/identities/:identityId",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({
        identityId: z.string().uuid()
      }),
      body: z.object({
        projectId: z.string(),
        ownerEmail: z.string().email().nullable().optional(),
        status: z.nativeEnum(NhiIdentityStatus).optional()
      }),
      response: {
        200: z.object({
          identity: NhiIdentitiesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const identity = await server.services.nhi.updateIdentity({
        identityId: req.params.identityId,
        projectId: req.body.projectId,
        ownerEmail: req.body.ownerEmail ?? undefined,
        status: req.body.status,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { identity };
    }
  });

  // --- Stats ---

  server.route({
    method: "GET",
    url: "/stats",
    config: { rateLimit: readLimit },
    schema: {
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          total: z.number(),
          criticalCount: z.number(),
          highCount: z.number(),
          mediumCount: z.number(),
          lowCount: z.number(),
          unownedCount: z.number(),
          avgRiskScore: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.nhi.getStats({
        projectId: req.query.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
    }
  });

  // --- Remediation ---

  server.route({
    method: "POST",
    url: "/identities/:identityId/remediate",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({
        identityId: z.string().uuid()
      }),
      body: z.object({
        projectId: z.string(),
        actionType: z.nativeEnum(NhiRemediationActionType),
        riskFactor: z.string().optional()
      }),
      response: {
        200: z.object({
          action: NhiRemediationActionsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const action = await server.services.nhiRemediation.executeRemediation({
        identityId: req.params.identityId,
        projectId: req.body.projectId,
        actionType: req.body.actionType,
        riskFactor: req.body.riskFactor,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { action };
    }
  });

  server.route({
    method: "GET",
    url: "/identities/:identityId/recommended-actions",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({
        identityId: z.string().uuid()
      }),
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          actions: z
            .object({
              actionType: z.string(),
              label: z.string(),
              description: z.string(),
              severity: z.string(),
              riskFactor: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const actions = await server.services.nhiRemediation.getRecommendedActions({
        identityId: req.params.identityId,
        projectId: req.query.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { actions };
    }
  });

  server.route({
    method: "GET",
    url: "/identities/:identityId/remediation-actions",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({
        identityId: z.string().uuid()
      }),
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          actions: NhiRemediationActionsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const actions = await server.services.nhiRemediation.listActions({
        identityId: req.params.identityId,
        projectId: req.query.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { actions };
    }
  });
};
