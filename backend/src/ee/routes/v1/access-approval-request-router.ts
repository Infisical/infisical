import { z } from "zod";

import { AccessApprovalRequestsSchema } from "@app/db/schemas/access-approval-requests";
import { AccessApprovalRequestsReviewersSchema } from "@app/db/schemas/access-approval-requests-reviewers";
import { UsersSchema } from "@app/db/schemas/users";
import { ApprovalStatus } from "@app/ee/services/access-approval-request/access-approval-request-types";
import { ms } from "@app/lib/ms";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const approvalRequestUser = z.object({ userId: z.string() }).merge(
  UsersSchema.pick({
    email: true,
    firstName: true,
    lastName: true,
    username: true
  })
);

export const registerAccessApprovalRequestRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        permissions: z.any().array(),
        isTemporary: z.boolean(),
        temporaryRange: z
          .string()
          .optional()
          .transform((val, ctx) => {
            if (!val || val === "permanent") return undefined;

            const parsedMs = ms(val);

            if (typeof parsedMs !== "number" || parsedMs <= 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Invalid time period format or value. Must be a positive duration (e.g., '1h', '30m', '2d')."
              });
              return z.NEVER;
            }
            return val;
          }),
        note: z.string().max(255).optional()
      }),
      querystring: z.object({
        projectSlug: z.string().trim()
      }),
      response: {
        200: z.object({
          approval: AccessApprovalRequestsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { request } = await server.services.accessApprovalRequest.createAccessApprovalRequest({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        permissions: req.body.permissions,
        actorOrgId: req.permission.orgId,
        projectSlug: req.query.projectSlug,
        temporaryRange: req.body.temporaryRange,
        isTemporary: req.body.isTemporary,
        note: req.body.note
      });
      return { approval: request };
    }
  });

  server.route({
    url: "/count",
    method: "GET",
    schema: {
      querystring: z.object({
        projectSlug: z.string().trim(),
        policyId: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          pendingCount: z.number(),
          finalizedCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { count } = await server.services.accessApprovalRequest.getCount({
        projectSlug: req.query.projectSlug,
        policyId: req.query.policyId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      return { ...count };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    schema: {
      querystring: z.object({
        projectSlug: z.string().trim(),
        authorUserId: z.string().trim().optional(),
        envSlug: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          requests: AccessApprovalRequestsSchema.extend({
            environmentName: z.string(),
            isApproved: z.boolean(),
            privilege: z
              .object({
                membershipId: z.string(),
                isTemporary: z.boolean(),
                temporaryMode: z.string().nullish(),
                temporaryRange: z.string().nullish(),
                temporaryAccessStartTime: z.date().nullish(),
                temporaryAccessEndTime: z.date().nullish(),
                permissions: z.unknown()
              })
              .nullable(),
            policy: z.object({
              id: z.string(),
              name: z.string(),
              approvals: z.number(),
              approvers: z
                .object({
                  isOrgMembershipActive: z.boolean().nullable().optional(),
                  userId: z.string().nullable().optional(),
                  sequence: z.number().nullable().optional(),
                  approvalsRequired: z.number().nullable().optional(),
                  email: z.string().nullable().optional(),
                  username: z.string().nullable().optional()
                })
                .array(),
              bypassers: z.string().array(),
              secretPath: z.string().nullish(),
              envId: z.string(),
              enforcementLevel: z.string(),
              deletedAt: z.date().nullish(),
              allowedSelfApprovals: z.boolean(),
              maxTimePeriod: z.string().nullable().optional()
            }),
            reviewers: z
              .object({
                isOrgMembershipActive: z.boolean().nullable().optional(),
                userId: z.string(),
                status: z.string()
              })
              .array(),
            requestedByUser: approvalRequestUser
          }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { requests } = await server.services.accessApprovalRequest.listApprovalRequests({
        projectSlug: req.query.projectSlug,
        authorUserId: req.query.authorUserId,
        envSlug: req.query.envSlug,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      return { requests };
    }
  });

  server.route({
    url: "/:requestId/review",
    method: "POST",
    schema: {
      params: z.object({
        requestId: z.string().trim()
      }),
      body: z.object({
        status: z.enum([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED]),
        bypassReason: z.string().min(10).max(1000).optional()
      }),
      response: {
        200: z.object({
          review: AccessApprovalRequestsReviewersSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const review = await server.services.accessApprovalRequest.reviewAccessRequest({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        requestId: req.params.requestId,
        status: req.body.status,
        bypassReason: req.body.bypassReason
      });

      return { review };
    }
  });

  server.route({
    url: "/:requestId",
    method: "PATCH",
    schema: {
      params: z.object({
        requestId: z.string().trim()
      }),
      body: z.object({
        temporaryRange: z.string().transform((val, ctx) => {
          const parsedMs = ms(val);

          if (typeof parsedMs !== "number" || parsedMs <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Invalid time period format or value. Must be a positive duration (e.g., '1h', '30m', '2d')."
            });
            return z.NEVER;
          }
          return val;
        }),
        editNote: z.string().max(255)
      }),
      response: {
        200: z.object({
          approval: AccessApprovalRequestsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { request } = await server.services.accessApprovalRequest.updateAccessApprovalRequest({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        temporaryRange: req.body.temporaryRange,
        editNote: req.body.editNote,
        requestId: req.params.requestId
      });
      return { approval: request };
    }
  });
};
