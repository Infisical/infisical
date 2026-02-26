import { z } from "zod";

import {
  NhiIdentitiesSchema,
  NhiPoliciesSchema,
  NhiPolicyExecutionsSchema,
  NhiRemediationActionsSchema,
  NhiScansSchema,
  NhiSourcesSchema
} from "@app/db/schemas";
import { NhiIdentityStatus, NhiRemediationActionType, NhiScanSchedule } from "@app/ee/services/nhi/nhi-enums";
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
        config: z.record(z.unknown()).optional(),
        scanSchedule: z.nativeEnum(NhiScanSchedule).nullable().optional()
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
        scanSchedule: req.body.scanSchedule ?? undefined,
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

  server.route({
    method: "PATCH",
    url: "/sources/:sourceId",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({
        sourceId: z.string().uuid()
      }),
      body: z.object({
        projectId: z.string(),
        name: z.string().min(1).max(255).optional(),
        scanSchedule: z.nativeEnum(NhiScanSchedule).nullable().optional()
      }),
      response: {
        200: z.object({
          source: NhiSourcesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const source = await server.services.nhi.updateSource({
        sourceId: req.params.sourceId,
        projectId: req.body.projectId,
        name: req.body.name,
        scanSchedule: req.body.scanSchedule,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { source };
    }
  });

  // --- Notification Settings ---

  server.route({
    method: "GET",
    url: "/notification-settings",
    config: { rateLimit: readLimit },
    schema: {
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          isNhiScanNotificationEnabled: z.boolean(),
          nhiScanChannels: z.string(),
          isNhiPolicyNotificationEnabled: z.boolean(),
          nhiPolicyChannels: z.string(),
          isSlackConfigured: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const config = await server.services.projectSlackConfig?.getIntegrationDetailsByProject(req.query.projectId);
      if (!config) {
        return {
          isNhiScanNotificationEnabled: false,
          nhiScanChannels: "",
          isNhiPolicyNotificationEnabled: false,
          nhiPolicyChannels: "",
          isSlackConfigured: false
        };
      }
      return {
        isNhiScanNotificationEnabled: config.isNhiScanNotificationEnabled ?? false,
        nhiScanChannels: config.nhiScanChannels ?? "",
        isNhiPolicyNotificationEnabled: config.isNhiPolicyNotificationEnabled ?? false,
        nhiPolicyChannels: config.nhiPolicyChannels ?? "",
        isSlackConfigured: true
      };
    }
  });

  server.route({
    method: "PUT",
    url: "/notification-settings",
    config: { rateLimit: writeLimit },
    schema: {
      body: z.object({
        projectId: z.string(),
        isNhiScanNotificationEnabled: z.boolean().optional(),
        nhiScanChannels: z.string().max(255).optional(),
        isNhiPolicyNotificationEnabled: z.boolean().optional(),
        nhiPolicyChannels: z.string().max(255).optional()
      }),
      response: {
        200: z.object({
          success: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const config = await server.services.projectSlackConfig?.getIntegrationDetailsByProject(req.body.projectId);
      if (!config) {
        return { success: false };
      }

      const updateData: Record<string, unknown> = {};
      if (req.body.isNhiScanNotificationEnabled !== undefined)
        updateData.isNhiScanNotificationEnabled = req.body.isNhiScanNotificationEnabled;
      if (req.body.nhiScanChannels !== undefined) updateData.nhiScanChannels = req.body.nhiScanChannels;
      if (req.body.isNhiPolicyNotificationEnabled !== undefined)
        updateData.isNhiPolicyNotificationEnabled = req.body.isNhiPolicyNotificationEnabled;
      if (req.body.nhiPolicyChannels !== undefined) updateData.nhiPolicyChannels = req.body.nhiPolicyChannels;

      await server.services.projectSlackConfig?.updateById(config.id, updateData);
      return { success: true };
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
          riskAcceptedCount: z.number(),
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

  // --- Risk Acceptance ---

  server.route({
    method: "POST",
    url: "/identities/:identityId/accept-risk",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({
        identityId: z.string().uuid()
      }),
      body: z.object({
        projectId: z.string(),
        reason: z.string().min(1).max(1000),
        expiresAt: z.string().datetime().optional()
      }),
      response: {
        200: z.object({
          identity: NhiIdentitiesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const identity = await server.services.nhi.acceptRisk({
        identityId: req.params.identityId,
        projectId: req.body.projectId,
        reason: req.body.reason,
        expiresAt: req.body.expiresAt,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { identity };
    }
  });

  server.route({
    method: "POST",
    url: "/identities/:identityId/revoke-risk-acceptance",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({
        identityId: z.string().uuid()
      }),
      body: z.object({
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
      const identity = await server.services.nhi.revokeRiskAcceptance({
        identityId: req.params.identityId,
        projectId: req.body.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { identity };
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

  // --- Policies ---

  server.route({
    method: "GET",
    url: "/policies",
    config: { rateLimit: readLimit },
    schema: {
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          policies: NhiPoliciesSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const policies = await server.services.nhiPolicy.listPolicies({
        projectId: req.query.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { policies };
    }
  });

  server.route({
    method: "POST",
    url: "/policies",
    config: { rateLimit: writeLimit },
    schema: {
      body: z.object({
        projectId: z.string(),
        name: z.string().min(1).max(255),
        description: z.string().max(1000).optional(),
        isEnabled: z.boolean().optional(),
        conditionRiskFactors: z.array(z.string()).optional(),
        conditionMinRiskScore: z.number().int().min(0).max(100).optional(),
        conditionIdentityTypes: z.array(z.string()).optional(),
        conditionProviders: z.array(z.string()).optional(),
        actionRemediate: z.nativeEnum(NhiRemediationActionType).nullable().optional(),
        actionFlag: z.boolean().optional()
      }),
      response: {
        200: z.object({
          policy: NhiPoliciesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const policy = await server.services.nhiPolicy.createPolicy({
        ...req.body,
        actionRemediate: req.body.actionRemediate ?? undefined,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { policy };
    }
  });

  server.route({
    method: "PATCH",
    url: "/policies/:policyId",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({
        policyId: z.string().uuid()
      }),
      body: z.object({
        projectId: z.string(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(1000).nullable().optional(),
        isEnabled: z.boolean().optional(),
        conditionRiskFactors: z.array(z.string()).nullable().optional(),
        conditionMinRiskScore: z.number().int().min(0).max(100).nullable().optional(),
        conditionIdentityTypes: z.array(z.string()).nullable().optional(),
        conditionProviders: z.array(z.string()).nullable().optional(),
        actionRemediate: z.nativeEnum(NhiRemediationActionType).nullable().optional(),
        actionFlag: z.boolean().optional()
      }),
      response: {
        200: z.object({
          policy: NhiPoliciesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const policy = await server.services.nhiPolicy.updatePolicy({
        policyId: req.params.policyId,
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { policy };
    }
  });

  server.route({
    method: "DELETE",
    url: "/policies/:policyId",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({
        policyId: z.string().uuid()
      }),
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          policy: NhiPoliciesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const policy = await server.services.nhiPolicy.deletePolicy({
        policyId: req.params.policyId,
        projectId: req.query.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { policy };
    }
  });

  server.route({
    method: "GET",
    url: "/policies/:policyId/executions",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({
        policyId: z.string().uuid()
      }),
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          executions: NhiPolicyExecutionsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const executions = await server.services.nhiPolicy.getPolicyExecutions({
        policyId: req.params.policyId,
        projectId: req.query.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { executions };
    }
  });

  server.route({
    method: "GET",
    url: "/policy-executions",
    config: { rateLimit: readLimit },
    schema: {
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          executions: NhiPolicyExecutionsSchema.extend({
            policyName: z.string().nullable().optional(),
            identityName: z.string().nullable().optional()
          }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const executions = await server.services.nhiPolicy.listRecentExecutions({
        projectId: req.query.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { executions };
    }
  });
};
