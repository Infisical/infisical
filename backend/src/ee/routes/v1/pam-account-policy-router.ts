import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PolicyRulesInputSchema, SanitizedPamAccountPolicySchema } from "@app/ee/services/pam-account-policy";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

type TSanitizedPolicy = z.infer<typeof SanitizedPamAccountPolicySchema>;

export const registerPamAccountPolicyRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List PAM account policies",
      querystring: z.object({
        projectId: z.string().uuid(),
        search: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          policies: z.array(SanitizedPamAccountPolicySchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const policies = await server.services.pamAccountPolicy.list(req.query, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.query.projectId,
        event: {
          type: EventType.PAM_ACCOUNT_POLICY_LIST,
          metadata: {
            projectId: req.query.projectId
          }
        }
      });

      return { policies: policies as TSanitizedPolicy[] };
    }
  });

  server.route({
    method: "GET",
    url: "/:policyId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get a PAM account policy by ID",
      params: z.object({
        policyId: z.string().uuid()
      }),
      response: {
        200: z.object({
          policy: SanitizedPamAccountPolicySchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const policy = await server.services.pamAccountPolicy.getById(req.params, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: policy.projectId,
        event: {
          type: EventType.PAM_ACCOUNT_POLICY_GET,
          metadata: {
            policyId: policy.id,
            projectId: policy.projectId
          }
        }
      });

      return { policy: policy as TSanitizedPolicy };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Create a PAM account policy",
      body: z.object({
        projectId: z.string().uuid(),
        name: slugSchema({ field: "name", max: 255 }),
        description: z.string().trim().max(1000).optional(),
        rules: PolicyRulesInputSchema
      }),
      response: {
        200: z.object({
          policy: SanitizedPamAccountPolicySchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const policy = await server.services.pamAccountPolicy.create(req.body, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.body.projectId,
        event: {
          type: EventType.PAM_ACCOUNT_POLICY_CREATE,
          metadata: {
            projectId: req.body.projectId,
            name: req.body.name,
            description: req.body.description
          }
        }
      });

      return { policy: policy as TSanitizedPolicy };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:policyId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Update a PAM account policy",
      params: z.object({
        policyId: z.string().uuid()
      }),
      body: z.object({
        name: slugSchema({ field: "name", max: 255 }).optional(),
        description: z.string().trim().max(1000).nullable().optional(),
        rules: PolicyRulesInputSchema.optional(),
        isActive: z.boolean().optional()
      }),
      response: {
        200: z.object({
          policy: SanitizedPamAccountPolicySchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const policy = await server.services.pamAccountPolicy.updateById(
        { policyId: req.params.policyId, ...req.body },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: policy.projectId,
        event: {
          type: EventType.PAM_ACCOUNT_POLICY_UPDATE,
          metadata: {
            policyId: policy.id,
            projectId: policy.projectId,
            name: req.body.name,
            isActive: req.body.isActive
          }
        }
      });

      return { policy: policy as TSanitizedPolicy };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:policyId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Delete a PAM account policy",
      params: z.object({
        policyId: z.string().uuid()
      }),
      response: {
        200: z.object({
          policy: SanitizedPamAccountPolicySchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const policy = await server.services.pamAccountPolicy.deleteById(req.params, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: policy.projectId,
        event: {
          type: EventType.PAM_ACCOUNT_POLICY_DELETE,
          metadata: {
            policyId: policy.id,
            projectId: policy.projectId,
            name: policy.name
          }
        }
      });

      return { policy: policy as TSanitizedPolicy };
    }
  });
};
