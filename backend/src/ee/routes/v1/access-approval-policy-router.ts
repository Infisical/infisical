import { nanoid } from "nanoid";
import { z } from "zod";

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
          workspaceId: z.string(),
          name: z.string().optional(),
          environment: z.string(),
          approvers: z.string().array().min(1),
          approvals: z.number().min(1).default(1)
        })
        .refine((data) => data.approvals <= data.approvers.length, {
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
        projectId: req.body.workspaceId,
        ...req.body,
        name: req.body.name ?? `${req.body.environment}-${nanoid(3)}`
      });
      return { approval };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    schema: {
      querystring: z.object({
        workspaceId: z.string().trim()
      }),
      response: {
        200: z.object({
          approvals: sapPubSchema.merge(z.object({ approvers: z.string().array() })).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const approvals = await server.services.accessApprovalPolicy.getAccessApprovalPolicyByProjectId({
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
    url: "/:policyId",
    method: "PATCH",
    schema: {
      params: z.object({
        policyId: z.string()
      }),
      body: z
        .object({
          name: z.string().optional(),
          approvers: z.string().array().min(1),
          approvals: z.number().min(1).default(1)
        })
        .refine((data) => data.approvals <= data.approvers.length, {
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
