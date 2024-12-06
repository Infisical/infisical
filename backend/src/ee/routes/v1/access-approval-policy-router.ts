import { nanoid } from "nanoid";
import { z } from "zod";

import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { EnforcementLevel } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { sapPubSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerAccessApprovalPolicyRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        projectSlug: z.string().trim(),
        name: z.string().optional(),
        secretPath: z.string().trim().default("/"),
        environment: z.string(),
        approvers: z
          .discriminatedUnion("type", [
            z.object({ type: z.literal(ApproverType.Group), id: z.string() }),
            z.object({ type: z.literal(ApproverType.User), id: z.string().optional(), name: z.string().optional() })
          ])
          .array()
          .min(1, { message: "At least one approver should be provided" }),
        approvals: z.number().min(1).default(1),
        enforcementLevel: z.nativeEnum(EnforcementLevel).default(EnforcementLevel.Hard)
      }),
      response: {
        200: z.object({
          approval: sapPubSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const approval = await server.services.accessApprovalPolicy.createAccessApprovalPolicy({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        projectSlug: req.body.projectSlug,
        name: req.body.name ?? `${req.body.environment}-${nanoid(3)}`,
        enforcementLevel: req.body.enforcementLevel
      });
      return { approval };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        projectSlug: z.string().trim()
      }),
      response: {
        200: z.object({
          approvals: sapPubSchema
            .extend({
              approvers: z
                .object({ type: z.nativeEnum(ApproverType), id: z.string().nullable().optional() })
                .array()
                .nullable()
                .optional()
            })
            .array()
            .nullable()
            .optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const approvals = await server.services.accessApprovalPolicy.getAccessApprovalPolicyByProjectSlug({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectSlug: req.query.projectSlug
      });

      return { approvals };
    }
  });

  server.route({
    url: "/count",
    method: "GET",
    schema: {
      querystring: z.object({
        projectSlug: z.string(),
        envSlug: z.string()
      }),
      response: {
        200: z.object({
          count: z.number()
        })
      }
    },

    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { count } = await server.services.accessApprovalPolicy.getAccessPolicyCountByEnvSlug({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        projectSlug: req.query.projectSlug,
        actorOrgId: req.permission.orgId,
        envSlug: req.query.envSlug
      });
      return { count };
    }
  });

  server.route({
    url: "/:policyId",
    method: "PATCH",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        policyId: z.string()
      }),
      body: z.object({
        name: z.string().optional(),
        secretPath: z
          .string()
          .trim()
          .optional()
          .transform((val) => (val === "" ? "/" : val)),
        approvers: z
          .discriminatedUnion("type", [
            z.object({ type: z.literal(ApproverType.Group), id: z.string() }),
            z.object({ type: z.literal(ApproverType.User), id: z.string().optional(), name: z.string().optional() })
          ])
          .array()
          .min(1, { message: "At least one approver should be provided" }),
        approvals: z.number().min(1).optional(),
        enforcementLevel: z.nativeEnum(EnforcementLevel).default(EnforcementLevel.Hard)
      }),
      response: {
        200: z.object({
          approval: sapPubSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      await server.services.accessApprovalPolicy.updateAccessApprovalPolicy({
        policyId: req.params.policyId,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        ...req.body
      });
    }
  });

  server.route({
    url: "/:policyId",
    method: "DELETE",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        policyId: z.string()
      }),
      response: {
        200: z.object({
          approval: sapPubSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const approval = await server.services.accessApprovalPolicy.deleteAccessApprovalPolicy({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        policyId: req.params.policyId
      });
      return { approval };
    }
  });

  server.route({
    url: "/:policyId",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        policyId: z.string()
      }),
      response: {
        200: z.object({
          approval: sapPubSchema.extend({
            approvers: z
              .object({
                type: z.nativeEnum(ApproverType),
                id: z.string().nullable().optional(),
                name: z.string().nullable().optional()
              })
              .array()
              .nullable()
              .optional()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const approval = await server.services.accessApprovalPolicy.getAccessApprovalPolicyById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.params
      });

      return { approval };
    }
  });
};
