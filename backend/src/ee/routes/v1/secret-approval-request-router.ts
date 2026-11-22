import { ForbiddenError } from "@casl/ability";
import { FastifyRequest } from "fastify";
import { z } from "zod";

import { SecretApprovalRequestsReviewersSchema, SecretApprovalRequestsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  ApprovalStatus,
  RequestState,
  SecretApprovalRequestOrderBy
} from "@app/ee/services/secret-change-request/secret-change-request-types";
import {
  BadRequestError,
  ConflictError,
  ForbiddenRequestError,
  NotFoundError,
  PolicyViolationError
} from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrderByDirection } from "@app/lib/types";
import { bulkWriteLimit, readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { auditSafeText } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedTagSchema, SanitizedUserSchema, secretRawSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";
import { ResourceMetadataWithEncryptionSchema } from "@app/services/resource-metadata/resource-metadata-schema";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const approvalRequestUser = z.object({ userId: z.string().nullable().optional() }).merge(
  SanitizedUserSchema.pick({
    email: true,
    firstName: true,
    lastName: true,
    username: true
  })
);

const MAX_BATCH_REQUESTS = 50;

const batchFailureSchema = z.object({
  approvalRequestId: z.string().uuid(),
  message: z.string()
});

const getBatchFailureMessage = (error: unknown, approvalRequestId: string, action: "review" | "merge") => {
  if (error instanceof ForbiddenError) return `You don't have permission to ${action} this change request.`;
  if (
    error instanceof BadRequestError ||
    error instanceof NotFoundError ||
    error instanceof ConflictError ||
    error instanceof ForbiddenRequestError ||
    error instanceof PolicyViolationError
  )
    return error.message;
  logger.error(error, `Batch ${action} of change request failed [approvalRequestId=${approvalRequestId}]`);
  return `Something went wrong. Open this change request to ${action} it on its own.`;
};

export const registerSecretApprovalRequestRouter = async (server: FastifyZodProvider) => {
  const mergeRequest = async (
    req: FastifyRequest,
    approvalId: string,
    { bypassReason, requireApprovals }: { bypassReason?: string; requireApprovals?: boolean }
  ) =>
    server.services.secretChangeRequest.mergeSecretApprovalRequest({
      actorId: req.permission.id,
      actor: req.permission.type,
      actorAuthMethod: req.permission.authMethod,
      actorOrgId: req.permission.orgId,
      approvalId,
      bypassReason,
      requireApprovals
    });

  const recordMerge = async (
    req: FastifyRequest,
    {
      approval,
      projectId,
      secretMutationEvents,
      isMergedViaBypass,
      requestedByActor
    }: Awaited<ReturnType<typeof mergeRequest>>
  ) => {
    await server.services.auditLog.createAuditLog({
      ...req.auditLogInfo,
      orgId: req.permission.orgId,
      projectId,
      event: {
        type: EventType.SECRET_APPROVAL_MERGED,
        metadata: {
          mergedBy: req.permission.id,
          secretApprovalRequestSlug: approval.slug,
          secretApprovalRequestId: approval.id,
          isMergedViaBypass,
          bypassReason: approval.bypassReason ?? undefined
        }
      }
    });

    for await (const event of secretMutationEvents) {
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        actor: requestedByActor ?? req.auditLogInfo.actor,
        orgId: req.permission.orgId,
        projectId,
        event
      });
    }

    const timeToMergeSeconds = Math.round((Date.now() - new Date(approval.createdAt).getTime()) / 1000);
    void server.services.telemetry
      .sendPostHogEvents({
        event: PostHogEventTypes.SecretApprovalRequestMerged,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          requestId: approval.id,
          projectId,
          requestSlug: approval.slug,
          timeToMergeSeconds,
          ...req.auditLogInfo
        }
      })
      .catch(() => {});
  };

  const reviewRequest = async (
    req: FastifyRequest,
    approvalId: string,
    { status, comment }: { status: ApprovalStatus.APPROVED | ApprovalStatus.REJECTED; comment?: string }
  ) =>
    server.services.secretChangeRequest.reviewApproval({
      actorId: req.permission.id,
      actor: req.permission.type,
      actorAuthMethod: req.permission.authMethod,
      actorOrgId: req.permission.orgId,
      approvalId,
      status,
      comment
    });

  const recordReview = async (req: FastifyRequest, review: Awaited<ReturnType<typeof reviewRequest>>) => {
    await server.services.auditLog.createAuditLog({
      ...req.auditLogInfo,
      orgId: req.permission.orgId,
      projectId: review.projectId,
      event: {
        type: EventType.SECRET_APPROVAL_REQUEST_REVIEW,
        metadata: {
          secretApprovalRequestId: review.requestId,
          reviewedBy: review.reviewerUserId,
          status: review.status as ApprovalStatus,
          comment: review.comment || ""
        }
      }
    });

    void server.services.telemetry
      .sendPostHogEvents({
        event: PostHogEventTypes.SecretApprovalRequestReviewed,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          requestId: review.requestId,
          projectId: review.projectId,
          reviewStatus: review.status,
          ...req.auditLogInfo
        }
      })
      .catch(() => {});
  };

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listSecretApprovalRequests",
      querystring: z.object({
        projectId: z.string().trim(),
        environment: z.string().trim().optional(),
        committer: z.string().trim().optional(),
        search: z.string().trim().max(255).optional(),
        status: z.nativeEnum(RequestState).optional(),
        limit: z.coerce.number().default(20),
        offset: z.coerce.number().default(0),
        orderBy: z.nativeEnum(SecretApprovalRequestOrderBy).optional().describe("Field to order change requests by"),
        orderDirection: z.nativeEnum(OrderByDirection).optional().describe("Change request order direction")
      }),
      response: {
        200: z.object({
          approvals: SecretApprovalRequestsSchema.extend({
            secretPath: z.string(),
            policyId: z.string().uuid().nullable(),
            policy: z.object({
              id: z.string(),
              name: z.string(),
              approvals: z.number(),
              approvers: z
                .object({
                  userId: z.string().nullable().optional()
                })
                .array(),
              bypassers: z
                .object({
                  userId: z.string().nullable().optional()
                })
                .array(),
              secretPath: z.string().optional().nullable(),
              enforcementLevel: z.string(),
              deletedAt: z.date().nullish(),
              allowedSelfApprovals: z.boolean()
            }),
            committerUser: approvalRequestUser.nullish(),
            committerIdentity: z
              .object({
                identityId: z.string(),
                name: z.string()
              })
              .nullish(),
            commits: z.object({ op: z.string(), secretId: z.string().nullable().optional() }).array(),
            environment: z.string(),
            reviewers: z.object({ userId: z.string(), status: z.string() }).array(),
            approvers: z
              .object({
                userId: z.string().nullable().optional()
              })
              .array()
          }).array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { approvals, totalCount } = await server.services.secretChangeRequest.getSecretApprovals({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query,
        projectId: req.query.projectId
      });
      return { approvals, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/count",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getSecretApprovalRequestCount",
      querystring: z.object({
        projectId: z.string().trim(),
        policyId: z.string().trim().optional()
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const approvals = await server.services.secretChangeRequest.requestCount({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.query.projectId,
        policyId: req.query.policyId
      });
      return { approvals };
    }
  });

  // Batch routes deviate from per-resource REST on purpose: bulk review sends up to
  // MAX_BATCH_REQUESTS reviews or merges, and one call per request would exhaust writeLimit.
  // They return 200 with per-request failures in `failures`, like the Agent Vault membership routes.
  // Each request still goes through the single-request service path, with its own permission
  // check, transaction and audit events, so one failure doesn't stop the others. Audit and
  // telemetry run outside the try, because once the write commits the request can't be retried.
  server.route({
    method: "POST",
    url: "/batch/review",
    config: {
      rateLimit: bulkWriteLimit
    },
    schema: {
      hide: true,
      operationId: "batchReviewSecretApprovalRequests",
      body: z.object({
        approvalRequestIds: z.string().uuid().array().min(1).max(MAX_BATCH_REQUESTS),
        status: z.enum([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED]),
        comment: auditSafeText(z.string().max(1000), { allowMultiline: true }).optional()
      }),
      response: {
        200: z.object({
          reviews: SecretApprovalRequestsReviewersSchema.array(),
          failures: batchFailureSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const reviews: Awaited<ReturnType<typeof reviewRequest>>[] = [];
      const failures: z.infer<typeof batchFailureSchema>[] = [];
      for await (const approvalRequestId of new Set(req.body.approvalRequestIds)) {
        let review: Awaited<ReturnType<typeof reviewRequest>>;
        try {
          review = await reviewRequest(req, approvalRequestId, { status: req.body.status, comment: req.body.comment });
        } catch (error) {
          failures.push({ approvalRequestId, message: getBatchFailureMessage(error, approvalRequestId, "review") });
          continue;
        }
        reviews.push(review);
        await recordReview(req, review).catch((error) =>
          logger.error(
            error,
            `Failed to record batch review of change request [approvalRequestId=${approvalRequestId}]`
          )
        );
      }
      return { reviews, failures };
    }
  });

  server.route({
    method: "POST",
    url: "/batch/merge",
    config: {
      rateLimit: bulkWriteLimit
    },
    schema: {
      hide: true,
      operationId: "batchMergeSecretApprovalRequests",
      body: z.object({
        approvalRequestIds: z.string().uuid().array().min(1).max(MAX_BATCH_REQUESTS)
      }),
      response: {
        200: z.object({
          approvals: SecretApprovalRequestsSchema.array(),
          failures: batchFailureSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const approvals: Awaited<ReturnType<typeof mergeRequest>>["approval"][] = [];
      const failures: z.infer<typeof batchFailureSchema>[] = [];
      for await (const approvalRequestId of new Set(req.body.approvalRequestIds)) {
        let merge: Awaited<ReturnType<typeof mergeRequest>>;
        try {
          merge = await mergeRequest(req, approvalRequestId, { requireApprovals: true });
        } catch (error) {
          failures.push({ approvalRequestId, message: getBatchFailureMessage(error, approvalRequestId, "merge") });
          continue;
        }
        approvals.push(merge.approval);
        await recordMerge(req, merge).catch((error) =>
          logger.error(error, `Failed to record batch merge of change request [approvalRequestId=${approvalRequestId}]`)
        );
      }
      return { approvals, failures };
    }
  });

  server.route({
    url: "/:id/merge",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "mergeSecretApprovalRequest",
      params: z.object({
        id: z.string().uuid()
      }),
      body: z.object({
        bypassReason: z.string().max(1000).optional(),
        requireApprovals: z
          .boolean()
          .optional()
          .describe(
            "When true, the merge fails instead of bypassing a soft-enforced policy whose required approvals are not met."
          )
      }),
      response: {
        200: z.object({
          approval: SecretApprovalRequestsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const merge = await mergeRequest(req, req.params.id, {
        bypassReason: req.body.bypassReason,
        requireApprovals: req.body.requireApprovals
      });
      await recordMerge(req, merge);
      return { approval: merge.approval };
    }
  });

  server.route({
    method: "POST",
    url: "/:id/review",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "reviewSecretApprovalRequest",
      params: z.object({
        id: z.string().uuid()
      }),
      body: z.object({
        status: z.enum([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED]),
        comment: auditSafeText(z.string(), { allowMultiline: true }).optional()
      }),
      response: {
        200: z.object({
          review: SecretApprovalRequestsReviewersSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const review = await reviewRequest(req, req.params.id, req.body);
      await recordReview(req, review);
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
      operationId: "updateSecretApprovalRequestStatus",
      params: z.object({
        id: z.string().uuid()
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
      const approval = await server.services.secretChangeRequest.updateApprovalStatus({
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

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.SecretApprovalRequestStatusChanged,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            requestId: approval.id,
            projectId: approval.projectId,
            status: req.body.status,
            ...req.auditLogInfo
          }
        })
        .catch(() => {});

      return { approval };
    }
  });

  server.route({
    method: "GET",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getSecretApprovalRequest",
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: z.object({
          approval: SecretApprovalRequestsSchema.merge(
            z.object({
              policyId: z.string().uuid().nullable(),
              policy: z.object({
                id: z.string(),
                name: z.string(),
                approvals: z.number(),
                approvers: approvalRequestUser
                  .extend({ isOrgMembershipActive: z.boolean().nullable().optional() })
                  .array(),
                bypassers: approvalRequestUser.array(),
                secretPath: z.string().optional().nullable(),
                enforcementLevel: z.string(),
                deletedAt: z.date().nullish(),
                allowedSelfApprovals: z.boolean()
              }),
              environment: z.string(),
              statusChangedByUser: approvalRequestUser.optional(),
              committerUser: approvalRequestUser.nullish(),
              committerIdentity: z
                .object({
                  identityId: z.string(),
                  name: z.string()
                })
                .nullish(),
              reviewers: approvalRequestUser
                .extend({
                  status: z.string(),
                  comment: z.string().optional(),
                  createdAt: z.date(),
                  isOrgMembershipActive: z.boolean().nullable().optional()
                })
                .array(),
              secretPath: z.string(),
              commits: secretRawSchema
                .omit({
                  _id: true,
                  environment: true,
                  workspace: true,
                  type: true,
                  version: true,
                  secretValue: true,
                  secretComment: true
                })
                .extend({
                  secretValueHidden: z.boolean(),
                  secretValue: z.string().optional(),
                  secretComment: z.string().optional(),
                  skipMultilineEncoding: z.boolean().nullish(),
                  isRotatedSecret: z.boolean().optional(),
                  op: z.string(),
                  tags: SanitizedTagSchema.array().optional(),
                  secretMetadata: ResourceMetadataWithEncryptionSchema.nullish(),
                  secret: z
                    .object({
                      id: z.string(),
                      version: z.number(),
                      secretKey: z.string(),
                      secretValue: z.string().optional(),
                      secretValueHidden: z.boolean(),
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
                      secretValueHidden: z.boolean(),
                      secretComment: z.string().optional(),
                      tags: SanitizedTagSchema.array().optional(),
                      secretMetadata: ResourceMetadataWithEncryptionSchema.nullish(),
                      skipMultilineEncoding: z.boolean().nullish()
                    })
                    .optional()
                })
                .array()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const approval = await server.services.secretChangeRequest.getSecretApprovalDetails({
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
