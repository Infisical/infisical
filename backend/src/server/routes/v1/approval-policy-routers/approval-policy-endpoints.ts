import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import {
  TApprovalPolicy,
  TCreatePolicyDTO,
  TCreateRequestDTO,
  TUpdatePolicyDTO
} from "@app/services/approval-policy/approval-policy-types";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerApprovalPolicyEndpoints = <P extends TApprovalPolicy>({
  server,
  policyType,
  createPolicySchema,
  updatePolicySchema,
  policyResponseSchema,
  createRequestSchema,
  requestResponseSchema
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
  createRequestSchema: z.ZodType<TCreateRequestDTO>;
  requestResponseSchema: z.ZodTypeAny;
}) => {
  // Policies
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

      // TODO(andrey): Audit log

      return { policy };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List approval policies",
      querystring: z.object({
        projectId: z.string().uuid()
      }),
      response: {
        200: z.object({
          policies: z.array(policyResponseSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { policies } = await server.services.approvalPolicy.list(policyType, req.query.projectId, req.permission);

      // TODO(andrey): Audit log

      return { policies };
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

      // TODO(andrey): Audit log

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

      // TODO(andrey): Audit log

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

      // TODO(andrey): Audit log

      return { policyId };
    }
  });

  // Requests
  server.route({
    method: "GET",
    url: "/requests",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List approval requests",
      querystring: z.object({
        projectId: z.string().uuid()
      }),
      response: {
        200: z.object({
          requests: z.array(requestResponseSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { requests } = await server.services.approvalPolicy.listRequests(
        policyType,
        req.query.projectId,
        req.permission
      );

      // TODO(andrey): Audit log

      return { requests };
    }
  });

  server.route({
    method: "POST",
    url: "/requests",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Create approval request",
      body: createRequestSchema,
      response: {
        200: z.object({
          request: requestResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      // To prevent type errors when accessing req.auth.user
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new BadRequestError({ message: "You can only request access using JWT auth tokens." });
      }

      const { request } = await server.services.approvalPolicy.createRequest(
        policyType,
        {
          requesterName: `${req.auth.user.firstName ?? ""} ${req.auth.user.lastName ?? ""}`.trim(),
          requesterEmail: req.auth.user.email ?? "",
          ...req.body
        },
        req.permission
      );

      // TODO(andrey): Audit log

      return { request };
    }
  });

  server.route({
    method: "GET",
    url: "/requests/:requestId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get approval request",
      params: z.object({
        requestId: z.string().uuid()
      }),
      response: {
        200: z.object({
          request: requestResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { request } = await server.services.approvalPolicy.getRequestById(req.params.requestId, req.permission);

      // TODO(andrey): Audit log

      return { request };
    }
  });

  server.route({
    method: "POST",
    url: "/requests/:requestId/approve",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Approve approval request",
      params: z.object({
        requestId: z.string().uuid()
      }),
      body: z.object({
        comment: z.string().optional()
      }),
      response: {
        200: z.object({
          request: requestResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { request } = await server.services.approvalPolicy.approveRequest(
        req.params.requestId,
        req.body,
        req.permission
      );

      // TODO(andrey): Audit log

      return { request };
    }
  });

  server.route({
    method: "POST",
    url: "/requests/:requestId/reject",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Reject approval request",
      params: z.object({
        requestId: z.string().uuid()
      }),
      body: z.object({
        comment: z.string().optional()
      }),
      response: {
        200: z.object({
          request: requestResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { request } = await server.services.approvalPolicy.rejectRequest(
        req.params.requestId,
        req.body,
        req.permission
      );

      // TODO(andrey): Audit log

      return { request };
    }
  });

  server.route({
    method: "POST",
    url: "/requests/:requestId/cancel",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Cancel approval request",
      params: z.object({
        requestId: z.string().uuid()
      }),
      response: {
        200: z.object({
          request: requestResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { request } = await server.services.approvalPolicy.cancelRequest(req.params.requestId, req.permission);

      // TODO(andrey): Audit log

      return { request };
    }
  });
};
