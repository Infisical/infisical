import { z } from "zod";

import {
  SecretApprovalRequestsReviewersSchema,
  SecretApprovalRequestsSchema,
  SecretTagsSchema,
  UsersSchema
} from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApprovalStatus, RequestState } from "@app/ee/services/secret-approval-request/secret-approval-request-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { secretRawSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

const approvalRequestUser = z.object({ userId: z.string() }).merge(
  UsersSchema.pick({
    email: true,
    firstName: true,
    lastName: true,
    username: true
  })
);

export const registerSecretApprovalRequestRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim().optional(),
        committer: z.string().trim().optional(),
        status: z.nativeEnum(RequestState).optional(),
        limit: z.coerce.number().default(20),
        offset: z.coerce.number().default(0)
      }),
      response: {
        200: z.object({
          approvals: SecretApprovalRequestsSchema.extend({
            // secretPath: z.string(),
            policy: z.object({
              id: z.string(),
              name: z.string(),
              approvals: z.number(),
              approvers: z.string().array(),
              secretPath: z.string().optional().nullable(),
              enforcementLevel: z.string()
            }),
            committerUser: approvalRequestUser,
            commits: z.object({ op: z.string(), secretId: z.string().nullable().optional() }).array(),
            environment: z.string(),
            reviewers: z.object({ userId: z.string(), status: z.string() }).array(),
            approvers: z.string().array()
          }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const approvals = await server.services.secretApprovalRequest.getSecretApprovals({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query,
        projectId: req.query.workspaceId
      });
      return { approvals };
    }
  });

  server.route({
    method: "GET",
    url: "/count",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        workspaceId: z.string().trim()
      }),
      response: {
        200: z.object({
          approvals: z.object({
            open: z.number().default(0),
            closed: z.number().default(0)
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const approvals = await server.services.secretApprovalRequest.requestCount({
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
    url: "/:id/merge",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      body: z.object({
        bypassReason: z.string().optional()
      }),
      response: {
        200: z.object({
          approval: SecretApprovalRequestsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { approval } = await server.services.secretApprovalRequest.mergeSecretApprovalRequest({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        approvalId: req.params.id,
        bypassReason: req.body.bypassReason
      });
      return { approval };
    }
  });

  server.route({
    method: "POST",
    url: "/:id/review",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      body: z.object({
        status: z.enum([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED])
      }),
      response: {
        200: z.object({
          review: SecretApprovalRequestsReviewersSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const review = await server.services.secretApprovalRequest.reviewApproval({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        approvalId: req.params.id,
        status: req.body.status
      });
      return { review };
    }
  });

  server.route({
    method: "POST",
    url: "/:id/status",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      body: z.object({
        status: z.nativeEnum(RequestState)
      }),
      response: {
        200: z.object({
          approval: SecretApprovalRequestsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const approval = await server.services.secretApprovalRequest.updateApprovalStatus({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        approvalId: req.params.id,
        status: req.body.status
      });

      const isClosing = approval.status === RequestState.Closed;
      await server.services.auditLog.createAuditLog({
        projectId: approval.projectId,
        ...req.auditLogInfo,
        event: {
          type: isClosing ? EventType.SECRET_APPROVAL_CLOSED : EventType.SECRET_APPROVAL_REOPENED,
          // eslint-disable-next-line
          metadata: {
            [isClosing ? ("closedBy" as const) : ("reopenedBy" as const)]: approval.statusChangedByUserId as string,
            secretApprovalRequestId: approval.id,
            secretApprovalRequestSlug: approval.slug
            // eslint-disable-next-line
          } as any
          // akhilmhdh: had to apply any to avoid ts issue with this
        }
      });

      return { approval };
    }
  });

  const tagSchema = SecretTagsSchema.pick({
    id: true,
    slug: true,
    name: true,
    color: true
  })
    .array()
    .optional();

  server.route({
    method: "GET",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      response: {
        200: z.object({
          approval: SecretApprovalRequestsSchema.merge(
            z.object({
              // secretPath: z.string(),
              policy: z.object({
                id: z.string(),
                name: z.string(),
                approvals: z.number(),
                approvers: approvalRequestUser.array(),
                secretPath: z.string().optional().nullable(),
                enforcementLevel: z.string()
              }),
              environment: z.string(),
              statusChangedByUser: approvalRequestUser.optional(),
              committerUser: approvalRequestUser,
              reviewers: approvalRequestUser.extend({ status: z.string() }).array(),
              secretPath: z.string(),
              commits: secretRawSchema
                .omit({ _id: true, environment: true, workspace: true, type: true, version: true })
                .extend({
                  op: z.string(),
                  tags: tagSchema,
                  secret: z
                    .object({
                      id: z.string(),
                      version: z.number(),
                      secretKey: z.string(),
                      secretValue: z.string().optional(),
                      secretComment: z.string().optional()
                    })
                    .optional()
                    .nullable(),
                  secretVersion: z
                    .object({
                      id: z.string(),
                      version: z.number(),
                      secretKey: z.string(),
                      secretValue: z.string().optional(),
                      secretComment: z.string().optional(),
                      tags: tagSchema
                    })
                    .optional()
                })
                .array()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const approval = await server.services.secretApprovalRequest.getSecretApprovalDetails({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.id
      });
      return { approval };
    }
  });
};
