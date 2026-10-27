import z from "zod";

import { ApprovalRequestsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamAccessType } from "@app/ee/services/pam/pam-enums";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { auditSafeText } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import {
  ApprovalAuditAction,
  ApprovalPolicyType,
  ApproverType
} from "@app/services/approval-policy/approval-policy-enums";
import {
  AutoApprovalInputDetailsSchema,
  AutoApprovalInputValuesSchema,
  AutoApprovalOutcomeSchema
} from "@app/services/approval-policy/auto-approval/auto-approval-schemas";
import { parsePamAccessDuration } from "@app/services/approval-policy/pam-access/pam-access-policy-fns";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

// The evidence holds data fetched from other services, so only its outcome is returned
const RequestSchema = ApprovalRequestsSchema.omit({ autoApprovalEvidence: true }).extend({
  autoApproval: AutoApprovalOutcomeSchema.optional()
});

const EnrichedRequestSchema = RequestSchema.extend({
  accountName: z.string().nullable(),
  accountType: z.string().nullable(),
  folderName: z.string().nullable(),
  accessType: z.nativeEnum(PamAccessType),
  grantId: z.string().uuid().nullable(),
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
      body: z
        .object({
          accountId: z.string().uuid().optional(),
          path: z.string().min(3).optional().describe("Account path in the format 'folderName/accountName'"),
          reason: auditSafeText(z.string().max(500), { allowMultiline: true }).optional(),
          duration: z
            .string()
            .trim()
            .min(1)
            .max(32)
            .refine((val) => parsePamAccessDuration(val) !== null, {
              message: "Invalid access duration. Use a single unit like '30m', '2h', or '1d'"
            }),
          accessType: z
            .nativeEnum(PamAccessType)
            .default(PamAccessType.Session)
            .describe("Whether the request unlocks launching sessions or viewing the account's credentials"),
          breakGlass: z
            .boolean()
            .optional()
            .describe(
              "Self-approve the request immediately instead of waiting for an approver. Requires break-glass eligibility and a reason of at least 10 characters, which is reused as the bypass reason."
            ),
          autoApprovalInputs: AutoApprovalInputValuesSchema.optional()
        })
        .refine((b) => Boolean(b.accountId) || Boolean(b.path), {
          message: "Either 'accountId' or 'path' is required"
        }),
      response: {
        200: z.object({
          request: RequestSchema
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
        autoApprovalInputs: req.body.autoApprovalInputs,
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
            accountName: result.accountName,
            folderId: result.folderId,
            folderName: result.folderName ?? undefined,
            requesterName: result.request.requesterName,
            requesterEmail: result.request.requesterEmail,
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

      if (result.request.autoApprovedAt) {
        const autoApprovedEvent = await server.services.approvalPolicy.buildAuditEvent({
          action: ApprovalAuditAction.RequestAutoApproved,
          request: result.request,
          actorId: req.permission.id
        });
        if (autoApprovedEvent) {
          await server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            actor: { type: ActorType.PLATFORM, metadata: {} },
            orgId: req.permission.orgId,
            projectId: req.internalPamProjectId,
            event: autoApprovedEvent
          });
        }
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
      querystring: z.object({
        folderId: z.string().uuid().optional()
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
      params: z.object({
        accountId: z.string().uuid()
      }),
      querystring: z.object({
        accessType: z.nativeEnum(PamAccessType).default(PamAccessType.Session)
      }),
      response: {
        200: z.object({
          autoApprovalInputs: AutoApprovalInputDetailsSchema.array(),
          autoApprovalOnly: z.boolean(),
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
};
