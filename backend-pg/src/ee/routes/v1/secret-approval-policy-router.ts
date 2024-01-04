import { nanoid } from "nanoid";
import { z } from "zod";

import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { sapPubSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretApprovalPolicyRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    schema: {
      body: z
        .object({
          workspaceId: z.string(),
          name: z.string().optional(),
          environment: z.string(),
          secretPath: z.string().optional().nullable(),
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
      const approval = await server.services.secretApprovalPolicy.createSap({
        actor: req.permission.type,
        actorId: req.permission.id,
        projectId: req.body.workspaceId,
        ...req.body,
        name: req.body.name ?? `${req.body.environment}-${nanoid(3)}`
      });
      return { approval };
    }
  });

  server.route({
    url: "/:sapId",
    method: "PATCH",
    schema: {
      params: z.object({
        sapId: z.string()
      }),
      body: z
        .object({
          name: z.string().optional(),
          approvers: z.string().array().min(1),
          approvals: z.number().min(1).default(1),
          secretPath: z.string().optional().nullable()
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
      const approval = await server.services.secretApprovalPolicy.updateSap({
        actor: req.permission.type,
        actorId: req.permission.id,
        ...req.body,
        secretPolicyId: req.params.sapId
      });
      return { approval };
    }
  });

  server.route({
    url: "/:sapId",
    method: "DELETE",
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
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const approval = await server.services.secretApprovalPolicy.deleteSap({
        actor: req.permission.type,
        actorId: req.permission.id,
        secretPolicyId: req.params.sapId
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
          approvals:  sapPubSchema.merge(z.object({approvers:z.string().array()})).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const approvals = await server.services.secretApprovalPolicy.getSapByProjectId({
        actor: req.permission.type,
        actorId: req.permission.id,
        projectId: req.query.workspaceId
      });
      return { approvals };
    }
  });

  server.route({
    url: "/board",
    method: "GET",
    schema: {
      querystring: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim()
      }),
      response: {
        200: z.object({
          policy: sapPubSchema.merge(z.object({approvers:z.string().array()})).optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const policy = await server.services.secretApprovalPolicy.getSapOfFolder({
        actor: req.permission.type,
        actorId: req.permission.id,
        projectId: req.query.workspaceId,
        ...req.query
      });
      return { policy };
    }
  });
};
