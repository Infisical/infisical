import z from "zod";

import { ApprovalRequestsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ApprovalRequestApprovalDecision } from "@app/services/approval-policy/approval-policy-enums";
import { AuthMode } from "@app/services/auth/auth-type";

const EnrichedRequestSchema = ApprovalRequestsSchema.extend({
  accountName: z.string().nullable(),
  accountType: z.string().nullable(),
  folderName: z.string().nullable(),
  grantExpiresAt: z.date().nullable(),
  grantStatus: z.string().nullable()
});

export const registerPamAccessRequestRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      body: z
        .object({
          accountId: z.string().uuid().optional(),
          path: z.string().min(3).optional().describe("Account path in the format 'folderName/accountName'"),
          reason: z.string().max(500).optional(),
          duration: z.string().min(1)
        })
        .refine((b) => Boolean(b.accountId) || Boolean(b.path), {
          message: "Either 'accountId' or 'path' is required"
        }),
      response: {
        200: z.object({
          request: ApprovalRequestsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pamAccessRequest.createRequest({
        accountId: req.body.accountId,
        path: req.body.path,
        projectId: req.internalPamProjectId,
        reason: req.body.reason,
        duration: req.body.duration,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalPamProjectId,
        event: {
          type: EventType.PAM_ACCESS_REQUEST_CREATE,
          metadata: {
            requestId: result.request.id,
            accountId: result.accountId,
            folderId: result.folderId,
            duration: req.body.duration,
            reason: req.body.reason
          }
        }
      });

      return { request: result.request };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      querystring: z.object({
        folderId: z.string().uuid(),
        status: z.string().optional(),
        offset: z.coerce.number().min(0).default(0).optional(),
        limit: z.coerce.number().min(1).max(100).default(20).optional()
      }),
      response: {
        200: z.object({
          requests: z.array(EnrichedRequestSchema),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pamAccessRequest.listRequests({
        projectId: req.internalPamProjectId,
        folderId: req.query.folderId,
        status: req.query.status,
        offset: req.query.offset,
        limit: req.query.limit,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/pending-my-approval",
    config: { rateLimit: readLimit },
    schema: {
      querystring: z.object({
        folderId: z.string().uuid().optional()
      }),
      response: {
        200: z.object({
          requests: z.array(EnrichedRequestSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pamAccessRequest.listPendingMyApproval({
        projectId: req.internalPamProjectId,
        folderId: req.query.folderId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/pending-my-approval/count",
    config: { rateLimit: readLimit },
    schema: {
      response: {
        200: z.object({
          pendingCount: z.number(),
          isApprover: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pamAccessRequest.getCount({
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return result;
    }
  });

  server.route({
    method: "POST",
    url: "/:requestId/review",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({
        requestId: z.string().uuid()
      }),
      body: z.object({
        status: z.nativeEnum(ApprovalRequestApprovalDecision),
        comment: z.string().max(500).optional()
      }),
      response: {
        200: z.object({
          request: ApprovalRequestsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pamAccessRequest.reviewRequest({
        requestId: req.params.requestId,
        projectId: req.internalPamProjectId,
        status: req.body.status,
        comment: req.body.comment,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalPamProjectId,
        event: {
          type: EventType.PAM_ACCESS_REQUEST_REVIEW,
          metadata: {
            requestId: req.params.requestId,
            accountId: result.accountId,
            folderId: result.folderId,
            status: req.body.status,
            comment: req.body.comment
          }
        }
      });

      return { request: result.request };
    }
  });

  server.route({
    method: "POST",
    url: "/:requestId/revoke",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({
        requestId: z.string().uuid()
      }),
      response: {
        200: z.object({
          grant: z.object({
            id: z.string().uuid(),
            status: z.string(),
            revokedAt: z.date().nullable()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pamAccessRequest.revokeGrant({
        requestId: req.params.requestId,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalPamProjectId,
        event: {
          type: EventType.PAM_ACCESS_GRANT_REVOKE,
          metadata: {
            requestId: req.params.requestId,
            grantId: result.grant.id,
            accountId: result.accountId,
            folderId: result.folderId
          }
        }
      });

      return {
        grant: {
          id: result.grant.id,
          status: result.grant.status,
          revokedAt: result.grant.revokedAt ?? null
        }
      };
    }
  });
};
