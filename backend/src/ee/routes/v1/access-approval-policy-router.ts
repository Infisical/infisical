import { nanoid } from "nanoid";
import { z } from "zod";

import { EnforcementLevel } from "@app/lib/types";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { sapPubSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerAccessApprovalPolicyRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    schema: {
      body: z
        .object({
          projectSlug: z.string().trim(),
          name: z.string().optional(),
          secretPath: z.string().trim().default("/"),
          environment: z.string(),
          approverUserIds: z.string().array().min(1),
          approvals: z.number().min(1).default(1),
          enforcementLevel: z.nativeEnum(EnforcementLevel).default(EnforcementLevel.Hard)
        })
        .refine((data) => data.approvals <= data.approverUserIds.length, {
          path: ["approvals"],
          message: "The number of approvals should be lower than the number of approvers."
        }),
      response: {
        200: z.object({
          approval: sapPubSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
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
    schema: {
      querystring: z.object({
        projectSlug: z.string().trim()
      }),
      response: {
        200: z.object({
          approvals: sapPubSchema
            .extend({
              userApprovers: z
                .object({
                  userId: z.string()
                })
                .array(),
              secretPath: z.string().optional().nullable()
            })
            .array()
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
    schema: {
      params: z.object({
        policyId: z.string()
      }),
      body: z
        .object({
          name: z.string().optional(),
          secretPath: z
            .string()
            .trim()
            .optional()
            .transform((val) => (val === "" ? "/" : val)),
          approverUserIds: z.string().array().min(1),
          approvals: z.number().min(1).default(1),
          enforcementLevel: z.nativeEnum(EnforcementLevel).default(EnforcementLevel.Hard)
        })
        .refine((data) => data.approvals <= data.approverUserIds.length, {
          path: ["approvals"],
          message: "The number of approvals should be lower than the number of approvers."
        }),
      response: {
        200: z.object({
          approval: sapPubSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
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
    onRequest: verifyAuth([AuthMode.JWT]),
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
};
