import { z } from "zod";

import {
  SecretApprovalRequestsReviewersSchema,
  SecretApprovalRequestsSchema,
  SecretApprovalRequestsSecretsSchema,
  SecretsSchema,
  SecretTagsSchema,
  SecretVersionsSchema
} from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApprovalStatus, RequestState } from "@app/ee/services/secret-approval-request/secret-approval-request-types";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretApprovalRequestRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "GET",
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
          approvals: SecretApprovalRequestsSchema.merge(
            z.object({
              // secretPath: z.string(),
              policy: z.object({
                id: z.string(),
                name: z.string(),
                approvals: z.number(),
                approvers: z.string().array(),
                secretPath: z.string().optional().nullable()
              }),
              commits: z.object({ op: z.string(), secretId: z.string().nullable().optional() }).array(),
              environment: z.string(),
              reviewers: z.object({ member: z.string(), status: z.string() }).array(),
              approvers: z.string().array()
            })
          ).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const approvals = await server.services.secretApprovalRequest.getSecretApprovals({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        ...req.query,
        projectId: req.query.workspaceId
      });
      return { approvals };
    }
  });

  server.route({
    url: "/count",
    method: "GET",
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
        actorOrgId: req.permission.orgId,
        projectId: req.query.workspaceId
      });
      return { approvals };
    }
  });

  server.route({
    url: "/:id/merge",
    method: "POST",
    schema: {
      params: z.object({
        id: z.string()
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
        actorOrgId: req.permission.orgId,
        approvalId: req.params.id
      });
      return { approval };
    }
  });

  server.route({
    url: "/:id/review",
    method: "POST",
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
        actorOrgId: req.permission.orgId,
        approvalId: req.params.id,
        status: req.body.status
      });
      return { review };
    }
  });

  server.route({
    url: "/:id/status",
    method: "POST",
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
            [isClosing ? ("closedBy" as const) : ("reopenedBy" as const)]: approval.statusChangeBy as string,
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
    url: "/:id",
    method: "GET",
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
                approvers: z.string().array(),
                secretPath: z.string().optional().nullable()
              }),
              environment: z.string(),
              reviewers: z.object({ member: z.string(), status: z.string() }).array(),
              approvers: z.string().array(),
              secretPath: z.string(),
              commits: SecretApprovalRequestsSecretsSchema.omit({ secretBlindIndex: true })
                .merge(
                  z.object({
                    tags: tagSchema,
                    secret: SecretsSchema.pick({
                      id: true,
                      version: true,
                      secretKeyIV: true,
                      secretKeyTag: true,
                      secretKeyCiphertext: true,
                      secretValueIV: true,
                      secretValueTag: true,
                      secretValueCiphertext: true,
                      secretCommentIV: true,
                      secretCommentTag: true,
                      secretCommentCiphertext: true
                    })
                      .optional()
                      .nullable(),
                    secretVersion: SecretVersionsSchema.pick({
                      id: true,
                      version: true,
                      secretKeyIV: true,
                      secretKeyTag: true,
                      secretKeyCiphertext: true,
                      secretValueIV: true,
                      secretValueTag: true,
                      secretValueCiphertext: true,
                      secretCommentIV: true,
                      secretCommentTag: true,
                      secretCommentCiphertext: true
                    })
                      .merge(
                        z.object({
                          tags: tagSchema
                        })
                      )
                      .optional()
                  })
                )
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
        actorOrgId: req.permission.orgId,
        id: req.params.id
      });
      return { approval };
    }
  });
};
