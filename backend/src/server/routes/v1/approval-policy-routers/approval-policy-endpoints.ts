import { z } from "zod";

import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import {
  TApprovalPolicy,
  TCreatePolicyDTO,
  TUpdatePolicyDTO
} from "@app/services/approval-policy/approval-policy-types";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerApprovalPolicyEndpoints = <P extends TApprovalPolicy>({
  server,
  policyType,
  createPolicySchema,
  updatePolicySchema,
  policyResponseSchema
}: {
  server: FastifyZodProvider;
  policyType: ApprovalPolicyType;
  createPolicySchema: z.ZodType<
    TCreatePolicyDTO & {
      conditions: P["conditions"]["conditions"];
      constraints: P["constraints"]["constraints"];
    }
  >;
  updatePolicySchema: z.ZodType<
    TUpdatePolicyDTO & {
      conditions?: P["conditions"]["conditions"];
      constraints?: P["constraints"]["constraints"];
    }
  >;
  policyResponseSchema: z.ZodTypeAny;
}) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Create approval policy",
      body: createPolicySchema,
      response: {
        200: z.object({
          policy: policyResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { policy } = await server.services.approvalPolicy.create(policyType, req.body, req.permission);

      // TODO: Audit log

      return { policy };
    }
  });

  server.route({
    method: "GET",
    url: "/:policyId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get approval policy",
      params: z.object({
        policyId: z.string().uuid()
      }),
      response: {
        200: z.object({
          policy: policyResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { policy } = await server.services.approvalPolicy.getById(req.params.policyId, req.permission);

      // TODO: Audit log

      return { policy };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:policyId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Update approval policy",
      params: z.object({
        policyId: z.string().uuid()
      }),
      body: updatePolicySchema,
      response: {
        200: z.object({
          policy: policyResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { policy } = await server.services.approvalPolicy.updateById(req.params.policyId, req.body, req.permission);

      // TODO: Audit log

      return { policy };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:policyId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Delete approval policy",
      params: z.object({
        policyId: z.string().uuid()
      }),
      response: {
        200: z.object({
          policyId: z.string().uuid()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { policyId } = await server.services.approvalPolicy.deleteById(req.params.policyId, req.permission);

      // TODO: Audit log

      return { policyId };
    }
  });
};
