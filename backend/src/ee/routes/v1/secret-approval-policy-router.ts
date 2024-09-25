import { nanoid } from "nanoid";
import { z } from "zod";

import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
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
      body: z.object({
        workspaceId: z.string(),
        name: z.string().optional(),
        environment: z.string(),
        secretPath: z
          .string()
          .optional()
          .nullable()
          .default("/")
          .transform((val) => (val ? removeTrailingSlash(val) : val)),
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
      const approval = await server.services.secretApprovalPolicy.createSecretApprovalPolicy({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.body.workspaceId,
        ...req.body,
        name: req.body.name ?? `${req.body.environment}-${nanoid(3)}`,
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
      params: z.object({
        sapId: z.string()
      }),
      body: z.object({
        name: z.string().optional(),
        approvers: z
          .discriminatedUnion("type", [
            z.object({ type: z.literal(ApproverType.Group), id: z.string() }),
            z.object({ type: z.literal(ApproverType.User), id: z.string().optional(), name: z.string().optional() })
          ])
          .array()
          .min(1, { message: "At least one approver should be provided" }),
        approvals: z.number().min(1).default(1),
        secretPath: z
          .string()
          .optional()
          .nullable()
          .transform((val) => (val ? removeTrailingSlash(val) : val))
          .transform((val) => (val === "" ? "/" : val)),
        enforcementLevel: z.nativeEnum(EnforcementLevel).optional()
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
      querystring: z.object({
        workspaceId: z.string().trim()
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
        projectId: req.query.workspaceId
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
                name: z.string().nullable().optional()
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
      querystring: z.object({
        workspaceId: z.string().trim(),
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
        projectId: req.query.workspaceId,
        ...req.query
      });
      return { policy };
    }
  });
};
