import { nanoid } from "nanoid";
import { z } from "zod";

import { ApproverType, BypasserType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { removeTrailingSlash } from "@app/lib/fn";
import { EnforcementLevel } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { sapPubSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretApprovalPolicyRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "createSecretApprovalPolicy",
      body: z
        .object({
          projectId: z.string(),
          name: z.string().optional(),
          environment: z.string().optional(),
          environments: z.string().array().optional(),
          secretPath: z
            .string()
            .min(1, { message: "Secret path cannot be empty" })
            .transform((val) => removeTrailingSlash(val)),
          approvers: z
            .discriminatedUnion("type", [
              z.object({ type: z.literal(ApproverType.Group), id: z.string() }),
              z.object({
                type: z.literal(ApproverType.User),
                id: z.string().optional(),
                username: z.string().optional()
              })
            ])
            .array()
            .min(1, { message: "At least one approver should be provided" })
            .max(100, "Cannot have more than 100 approvers"),
          bypassers: z
            .discriminatedUnion("type", [
              z.object({ type: z.literal(BypasserType.Group), id: z.string() }),
              z.object({
                type: z.literal(BypasserType.User),
                id: z.string().optional(),
                username: z.string().optional()
              })
            ])
            .array()
            .max(100, "Cannot have more than 100 bypassers")
            .optional(),
          approvals: z.number().min(1).default(1),
          enforcementLevel: z.nativeEnum(EnforcementLevel).default(EnforcementLevel.Hard),
          allowedSelfApprovals: z.boolean().default(true)
        })
        .refine((data) => data.environment || data.environments, "At least one environment should be provided"),
      response: {
        200: z.object({
          approval: sapPubSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const approval = await server.services.secretApprovalPolicy.createSecretApprovalPolicy({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        name: req.body.name ?? `${req.body.environment || req.body.environments?.join(",")}-${nanoid(3)}`,
        enforcementLevel: req.body.enforcementLevel
      });
      return { approval };
    }
  });

  server.route({
    url: "/:sapId",
    method: "PATCH",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateSecretApprovalPolicy",
      params: z.object({
        sapId: z.string()
      }),
      body: z.object({
        name: z.string().optional(),
        approvers: z
          .discriminatedUnion("type", [
            z.object({ type: z.literal(ApproverType.Group), id: z.string() }),
            z.object({ type: z.literal(ApproverType.User), id: z.string().optional(), username: z.string().optional() })
          ])
          .array()
          .min(1, { message: "At least one approver should be provided" })
          .max(100, "Cannot have more than 100 approvers"),
        bypassers: z
          .discriminatedUnion("type", [
            z.object({ type: z.literal(BypasserType.Group), id: z.string() }),
            z.object({ type: z.literal(BypasserType.User), id: z.string().optional(), username: z.string().optional() })
          ])
          .array()
          .max(100, "Cannot have more than 100 bypassers")
          .optional(),
        approvals: z.number().min(1).default(1),
        secretPath: z
          .string()
          .trim()
          .min(1, { message: "Secret path cannot be empty" })
          .optional()
          .transform((val) => (val ? removeTrailingSlash(val) : undefined)),
        enforcementLevel: z.nativeEnum(EnforcementLevel).optional(),
        allowedSelfApprovals: z.boolean().default(true),
        environments: z.array(z.string()).optional()
      }),
      response: {
        200: z.object({
          approval: sapPubSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const approval = await server.services.secretApprovalPolicy.updateSecretApprovalPolicy({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        secretPolicyId: req.params.sapId
      });
      return { approval };
    }
  });

  server.route({
    url: "/:sapId",
    method: "DELETE",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deleteSecretApprovalPolicy",
      params: z.object({
        sapId: z.string()
      }),
      response: {
        200: z.object({
          approval: sapPubSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const approval = await server.services.secretApprovalPolicy.deleteSecretApprovalPolicy({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        secretPolicyId: req.params.sapId
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
      operationId: "listSecretApprovalPolicies",
      querystring: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          approvals: sapPubSchema
            .extend({
              approvers: z
                .object({
                  id: z.string().nullable().optional(),
                  type: z.nativeEnum(ApproverType)
                })
                .array(),
              bypassers: z
                .object({
                  id: z.string().nullable().optional(),
                  type: z.nativeEnum(BypasserType)
                })
                .array()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const approvals = await server.services.secretApprovalPolicy.getSecretApprovalPolicyByProjectId({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.query.projectId
      });
      return { approvals };
    }
  });

  server.route({
    url: "/:sapId",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getSecretApprovalPolicy",
      params: z.object({
        sapId: z.string()
      }),
      response: {
        200: z.object({
          approval: sapPubSchema.extend({
            approvers: z
              .object({
                id: z.string().nullable().optional(),
                type: z.nativeEnum(ApproverType),
                username: z.string().nullable().optional()
              })
              .array(),
            bypassers: z
              .object({
                id: z.string().nullable().optional(),
                type: z.nativeEnum(BypasserType),
                username: z.string().nullable().optional()
              })
              .array()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const approval = await server.services.secretApprovalPolicy.getSecretApprovalPolicyById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.params
      });

      return { approval };
    }
  });

  server.route({
    url: "/board",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getSecretApprovalPolicyBoard",
      querystring: z.object({
        projectId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().transform(removeTrailingSlash)
      }),
      response: {
        200: z.object({
          policy: sapPubSchema
            .extend({
              userApprovers: z.object({ userId: z.string().nullable().optional() }).array()
            })
            .optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const policy = await server.services.secretApprovalPolicy.getSecretApprovalPolicyOfFolder({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });
      return { policy };
    }
  });
};
