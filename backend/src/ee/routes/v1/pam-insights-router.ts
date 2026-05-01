import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPamInsightsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/summary",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getPamInsightsSummary",
      description: "Get PAM project totals: resources, accounts, and active sessions",
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          totalResources: z.number(),
          resourcesWithRotation: z.number(),
          totalAccounts: z.number(),
          failedRotations: z.number(),
          failedRotationAccounts: z.array(
            z.object({
              accountId: z.string(),
              accountName: z.string(),
              resourceId: z.string(),
              resourceName: z.string(),
              resourceType: z.string(),
              lastRotatedAt: z.date().nullable()
            })
          ),
          activeSessions: z.number(),
          resourceTypeCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId } = req.query;
      const result = await server.services.pamInsights.getSummary(projectId, req.permission);
      await server.services.auditLog.createAuditLog({
        projectId,
        event: { type: EventType.VIEW_INSIGHTS_PAM_SUMMARY, metadata: { projectId } },
        ...req.auditLogInfo
      });
      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/session-activity",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getPamInsightsSessionActivity",
      description: "Get session counts grouped by day for the last 30 days",
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          days: z.array(z.object({ date: z.string(), count: z.number() })),
          avgPerDay: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId } = req.query;
      const result = await server.services.pamInsights.getSessionActivity(projectId, req.permission);
      await server.services.auditLog.createAuditLog({
        projectId,
        event: { type: EventType.VIEW_INSIGHTS_PAM_SESSION_ACTIVITY, metadata: { projectId } },
        ...req.auditLogInfo
      });
      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/top-actors",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getPamInsightsTopActors",
      description: "Get top actors initiating PAM sessions in the last 30 days",
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          actors: z.array(
            z.object({
              actorName: z.string(),
              actorEmail: z.string(),
              sessionCount: z.number(),
              isService: z.boolean()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId } = req.query;
      const result = await server.services.pamInsights.getTopActors(projectId, req.permission);
      await server.services.auditLog.createAuditLog({
        projectId,
        event: { type: EventType.VIEW_INSIGHTS_PAM_TOP_ACTORS, metadata: { projectId } },
        ...req.auditLogInfo
      });
      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/resource-breakdown",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getPamInsightsResourceBreakdown",
      description: "Get count of resources and accounts grouped by resource type",
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          breakdown: z.array(
            z.object({
              resourceType: z.string(),
              resourceCount: z.number()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId } = req.query;
      const result = await server.services.pamInsights.getResourceBreakdown(projectId, req.permission);
      await server.services.auditLog.createAuditLog({
        projectId,
        event: { type: EventType.VIEW_INSIGHTS_PAM_RESOURCE_BREAKDOWN, metadata: { projectId } },
        ...req.auditLogInfo
      });
      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/rotation-calendar",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getPamInsightsRotationCalendar",
      description: "Get rotation events for a calendar month, expanded across the visible grid",
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        projectId: z.string().trim(),
        month: z.coerce.number().int().min(1).max(12),
        year: z.coerce.number().int().min(1970).max(9999)
      }),
      response: {
        200: z.object({
          rotations: z.array(
            z.object({
              id: z.string(),
              accountId: z.string(),
              accountName: z.string(),
              resourceId: z.string(),
              resourceName: z.string(),
              resourceType: z.string(),
              intervalSeconds: z.number(),
              nextRotationAt: z.date()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId, month, year } = req.query;
      const result = await server.services.pamInsights.getRotationCalendar(projectId, month, year, req.permission);
      await server.services.auditLog.createAuditLog({
        projectId,
        event: {
          type: EventType.VIEW_INSIGHTS_PAM_ROTATION_CALENDAR,
          metadata: { projectId, month, year }
        },
        ...req.auditLogInfo
      });
      return result;
    }
  });
};
