import z from "zod";

import { ApprovalRequestsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamAccessType } from "@app/ee/services/pam/pam-enums";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import {
  ApprovalPolicyType,
  ApprovalRequestApprovalDecision,
  ApproverType
} from "@app/services/approval-policy/approval-policy-enums";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const EnrichedRequestSchema = ApprovalRequestsSchema.extend({
  accountName: z.string().nullable(),
  accountType: z.string().nullable(),
  folderName: z.string().nullable(),
  accessType: z.nativeEnum(PamAccessType),
  grantExpiresAt: z.date().nullable(),
  grantStatus: z.string().nullable(),
  isBreakGlass: z.boolean(),
  bypassReason: z.string().nullable()
});

export const registerPamAccessRequestRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "createPamAccessRequest",
      description: "Request access to a PAM account, either to launch sessions or to view its credentials",
      tags: [ApiDocsTags.PamAccessRequests],
      body: z
        .object({
          accountId: z.string().uuid().optional().describe("The ID of the account to request access to"),
          path: z.string().min(3).optional().describe("Account path in the format 'folderName/accountName'"),
          reason: z
            .string()
            .max(500)
            .optional()
            .describe("Why access is needed; required when the account's template requires a reason"),
          duration: z
            .string()
            .min(1)
            .describe("How long the access should last, as a single unit such as '30m', '2h', or '1d'"),
          accessType: z
            .nativeEnum(PamAccessType)
            .default(PamAccessType.Session)
            .describe("Whether the request unlocks launching sessions or viewing the account's credentials"),
          breakGlass: z
            .boolean()
            .optional()
            .describe(
              "Self-approve the request immediately instead of waiting for an approver. Requires break-glass eligibility and a reason of at least 10 characters, which is reused as the bypass reason."
            )
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const result = await server.services.pamAccessRequest.createRequest({
        accountId: req.body.accountId,
        path: req.body.path,
        projectId: req.internalPamProjectId,
        reason: req.body.reason,
        duration: req.body.duration,
        accessType: req.body.accessType,
        breakGlass: req.body.breakGlass,
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
            accessType: result.accessType,
            reason: req.body.reason
          }
        }
      });

      if (result.brokeGlass) {
        const bypass = result.breakGlassMetadata;
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          projectId: req.internalPamProjectId,
          event: {
            type: EventType.PAM_ACCESS_POLICY_BYPASSED,
            metadata: {
              policyType: ApprovalPolicyType.PamAccess,
              policyId: bypass.policyId,
              policyName: bypass.policyName,
              requestId: result.request.id,
              grantId: bypass.grantId,
              granteeUserId: req.permission.id,
              granteeName: bypass.granteeName ?? undefined,
              granteeEmail: bypass.granteeEmail ?? undefined,
              accountId: bypass.accountId,
              folderId: bypass.folderId,
              folderName: bypass.folderName ?? undefined,
              resourceName: bypass.folderName ?? undefined,
              accountName: bypass.accountName,
              accessDuration: bypass.accessDuration,
              bypassReason: req.body.reason as string,
              approverCount: bypass.approverCount
            }
          }
        });
      }

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamAccessRequestCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            accountType: result.accountType,
            orgId: req.permission.orgId
          }
        })
        .catch(() => {});

      return { request: result.request };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listPamAccessRequests",
      description: "List access requests for accounts in a PAM folder",
      tags: [ApiDocsTags.PamAccessRequests],
      querystring: z.object({
        folderId: z.string().uuid().describe("The ID of the folder whose access requests to list"),
        status: z.string().optional().describe("Filter by request status"),
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
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
      hide: false,
      operationId: "listPamAccessRequestsPendingMyApproval",
      description: "List access requests awaiting the caller's approval",
      tags: [ApiDocsTags.PamAccessRequests],
      querystring: z.object({
        folderId: z.string().uuid().optional().describe("Limit results to requests for accounts in this folder")
      }),
      response: {
        200: z.object({
          requests: z.array(EnrichedRequestSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
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
      hide: false,
      operationId: "getPamAccessRequestsPendingMyApprovalCount",
      description: "Count access requests awaiting the caller's approval",
      tags: [ApiDocsTags.PamAccessRequests],
      response: {
        200: z.object({
          pendingCount: z.number(),
          isApprover: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
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
    method: "GET",
    url: "/accounts/:accountId/approvers",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getPamAccountApprovers",
      description: "Get the approval steps and approvers that apply to a PAM account",
      tags: [ApiDocsTags.PamAccessRequests],
      params: z.object({
        accountId: z.string().uuid().describe("The ID of the account")
      }),
      querystring: z.object({
        accessType: z
          .nativeEnum(PamAccessType)
          .default(PamAccessType.Session)
          .describe("Whether to resolve approvers for launching sessions or for viewing credentials")
      }),
      response: {
        200: z.object({
          steps: z.array(
            z.object({
              requiredApprovals: z.number(),
              approvers: z.array(
                z.object({
                  type: z.nativeEnum(ApproverType),
                  name: z.string(),
                  memberCount: z.number().optional()
                })
              )
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const result = await server.services.pamAccessRequest.getAccountApprovers({
        accountId: req.params.accountId,
        projectId: req.internalPamProjectId,
        accessType: req.query.accessType,
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
      hide: false,
      operationId: "reviewPamAccessRequest",
      description: "Approve or reject a PAM access request",
      tags: [ApiDocsTags.PamAccessRequests],
      params: z.object({
        requestId: z.string().uuid().describe("The ID of the access request")
      }),
      body: z.object({
        status: z.nativeEnum(ApprovalRequestApprovalDecision).describe("The review decision"),
        comment: z.string().max(500).optional().describe("Optional comment shared with the requester")
      }),
      response: {
        200: z.object({
          request: ApprovalRequestsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
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

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamAccessRequestReviewed,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            orgId: req.permission.orgId,
            status: req.body.status
          }
        })
        .catch(() => {});

      return { request: result.request };
    }
  });

  server.route({
    method: "POST",
    url: "/:requestId/break-glass",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "breakGlassPamAccessRequest",
      description: "Self-approve your own pending PAM access request in an emergency",
      tags: [ApiDocsTags.PamAccessRequests],
      params: z.object({
        requestId: z.string().uuid().describe("The ID of the access request")
      }),
      body: z.object({
        bypassReason: z
          .string()
          .trim()
          .min(10)
          .max(500)
          .describe("Why the approvers are being skipped. Recorded in the audit log and sent to them.")
      }),
      response: {
        200: z.object({
          request: ApprovalRequestsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const result = await server.services.pamAccessRequest.breakGlassRequest({
        requestId: req.params.requestId,
        projectId: req.internalPamProjectId,
        bypassReason: req.body.bypassReason,
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
          type: EventType.PAM_ACCESS_POLICY_BYPASSED,
          metadata: {
            policyType: ApprovalPolicyType.PamAccess,
            policyId: result.policyId,
            policyName: result.policyName,
            requestId: req.params.requestId,
            grantId: result.grantId,
            granteeUserId: req.permission.id,
            granteeName: result.granteeName ?? undefined,
            granteeEmail: result.granteeEmail ?? undefined,
            accountId: result.accountId,
            folderId: result.folderId,
            folderName: result.folderName ?? undefined,
            resourceName: result.folderName ?? undefined,
            accountName: result.accountName,
            accessDuration: result.accessDuration,
            bypassReason: req.body.bypassReason,
            approverCount: result.approverCount
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamAccessRequestBrokeGlass,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            accountType: result.accountType,
            orgId: req.permission.orgId
          }
        })
        .catch(() => {});

      return { request: result.request };
    }
  });

  server.route({
    method: "POST",
    url: "/:requestId/revoke",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "revokePamAccessGrant",
      description: "Revoke the access grant issued for an approved PAM access request",
      tags: [ApiDocsTags.PamAccessRequests],
      params: z.object({
        requestId: z.string().uuid().describe("The ID of the access request")
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
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

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamAccessGrantRevoked,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            orgId: req.permission.orgId
          }
        })
        .catch(() => {});

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
