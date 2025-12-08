import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
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
  requestResponseSchema,
  grantResponseSchema
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
  grantResponseSchema: z.ZodTypeAny;
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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.body.projectId,
        event: {
          type: EventType.APPROVAL_POLICY_CREATE,
          metadata: {
            policyType,
            name: req.body.name
          }
        }
      });

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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.query.projectId,
        event: {
          type: EventType.APPROVAL_POLICY_LIST,
          metadata: {
            policyType,
            count: policies.length
          }
        }
      });

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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: policy.projectId,
        event: {
          type: EventType.APPROVAL_POLICY_GET,
          metadata: {
            policyType,
            policyId: policy.id,
            name: policy.name
          }
        }
      });

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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: policy.projectId,
        event: {
          type: EventType.APPROVAL_POLICY_UPDATE,
          metadata: {
            policyType,
            policyId: policy.id,
            name: policy.name
          }
        }
      });

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
      const { policyId, projectId } = await server.services.approvalPolicy.deleteById(
        req.params.policyId,
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.APPROVAL_POLICY_DELETE,
          metadata: {
            policyType,
            policyId
          }
        }
      });

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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.query.projectId,
        event: {
          type: EventType.APPROVAL_REQUEST_LIST,
          metadata: {
            policyType,
            count: requests.length
          }
        }
      });

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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: request.projectId,
        event: {
          type: EventType.APPROVAL_REQUEST_CREATE,
          metadata: {
            policyType,
            justification: req.body.justification || undefined,
            requestDuration: req.body.requestDuration || "infinite"
          }
        }
      });

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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: request.projectId,
        event: {
          type: EventType.APPROVAL_REQUEST_GET,
          metadata: {
            policyType,
            requestId: request.id,
            status: request.status
          }
        }
      });

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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: request.projectId,
        event: {
          type: EventType.APPROVAL_REQUEST_APPROVE,
          metadata: {
            policyType,
            requestId: req.params.requestId,
            comment: req.body.comment
          }
        }
      });

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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: request.projectId,
        event: {
          type: EventType.APPROVAL_REQUEST_REJECT,
          metadata: {
            policyType,
            requestId: req.params.requestId,
            comment: req.body.comment
          }
        }
      });

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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: request.projectId,
        event: {
          type: EventType.APPROVAL_REQUEST_CANCEL,
          metadata: {
            policyType,
            requestId: req.params.requestId
          }
        }
      });

      return { request };
    }
  });

  // Grants
  server.route({
    method: "GET",
    url: "/grants",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List approval grants",
      querystring: z.object({
        projectId: z.string().uuid()
      }),
      response: {
        200: z.object({
          grants: z.array(grantResponseSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { grants } = await server.services.approvalPolicy.listGrants(
        policyType,
        req.query.projectId,
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.query.projectId,
        event: {
          type: EventType.APPROVAL_REQUEST_GRANT_LIST,
          metadata: {
            policyType,
            count: grants.length
          }
        }
      });

      return { grants };
    }
  });

  server.route({
    method: "GET",
    url: "/grants/:grantId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get approval grant",
      params: z.object({
        grantId: z.string().uuid()
      }),
      response: {
        200: z.object({
          grant: grantResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { grant } = await server.services.approvalPolicy.getGrantById(req.params.grantId, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: grant.projectId,
        event: {
          type: EventType.APPROVAL_REQUEST_GRANT_GET,
          metadata: {
            policyType,
            grantId: grant.id,
            status: grant.status
          }
        }
      });

      return { grant };
    }
  });

  server.route({
    method: "POST",
    url: "/grants/:grantId/revoke",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Revoke approval grant",
      params: z.object({
        grantId: z.string().uuid()
      }),
      body: z.object({
        revocationReason: z.string().optional()
      }),
      response: {
        200: z.object({
          grant: grantResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { grant } = await server.services.approvalPolicy.revokeGrant(req.params.grantId, req.body, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: grant.projectId,
        event: {
          type: EventType.APPROVAL_REQUEST_GRANT_REVOKE,
          metadata: {
            policyType,
            grantId: grant.id,
            revocationReason: req.body.revocationReason
          }
        }
      });

      return { grant };
    }
  });
};
