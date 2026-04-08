import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerInsightsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/secrets/calendar",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getInsightsCalendar",
      description: "Get secret rotation and reminder events for a calendar month view",
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        projectId: z.string().trim(),
        month: z.coerce.number().min(1).max(12),
        year: z.coerce.number().min(2000).max(2100)
      }),
      response: {
        200: z.object({
          rotations: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              type: z.string(),
              nextRotationAt: z.date().nullable(),
              environment: z.string(),
              secretPath: z.string(),
              secretKeys: z.string().array(),
              rotationInterval: z.number(),
              rotationStatus: z.string().nullable(),
              isAutoRotationEnabled: z.boolean()
            })
          ),
          reminders: z.array(
            z.object({
              id: z.string(),
              secretId: z.string().nullable(),
              secretKey: z.string(),
              nextReminderDate: z.date(),
              message: z.string().nullable().optional(),
              environment: z.string(),
              secretPath: z.string(),
              repeatDays: z.number().nullable().optional()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId, month, year } = req.query;
      const result = await server.services.insights.getCalendar({ projectId, month, year }, req.permission);
      await server.services.auditLog.createAuditLog({
        projectId,
        event: { type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_CALENDAR, metadata: { projectId, month, year } },
        ...req.auditLogInfo
      });
      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/secrets/access-volume",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getInsightsAccessVolume",
      description: "Get secret access volume aggregated by day and actor for the past week",
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          days: z.array(
            z.object({
              date: z.string(),
              total: z.number(),
              actors: z.array(z.object({ name: z.string(), type: z.string(), count: z.number() }))
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId } = req.query;
      const result = await server.services.insights.getAccessVolume({ projectId }, req.permission);
      await server.services.auditLog.createAuditLog({
        projectId,
        event: { type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_ACCESS_VOLUME, metadata: { projectId } },
        ...req.auditLogInfo
      });
      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/secrets/access-locations",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getInsightsAccessLocations",
      description: "Get geographic locations of secret access based on audit log IP addresses",
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        projectId: z.string().trim(),
        days: z.coerce.number().min(1).max(90).default(30)
      }),
      response: {
        200: z.object({
          locations: z.array(
            z.object({ lat: z.number(), lng: z.number(), city: z.string(), country: z.string(), count: z.number() })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId, days } = req.query;
      const result = await server.services.insights.getAccessLocations({ projectId, days }, req.permission);
      await server.services.auditLog.createAuditLog({
        projectId,
        event: { type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_ACCESS_LOCATIONS, metadata: { projectId, days } },
        ...req.auditLogInfo
      });
      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/auth/method-distribution",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getInsightsAuthMethodDistribution",
      description: "Get distribution of authentication methods from secret access audit logs",
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        projectId: z.string().trim(),
        days: z.coerce.number().min(1).max(90).default(30)
      }),
      response: {
        200: z.object({
          methods: z.array(z.object({ method: z.string(), count: z.number() }))
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId, days } = req.query;
      const result = await server.services.insights.getAuthMethodDistribution({ projectId, days }, req.permission);
      await server.services.auditLog.createAuditLog({
        projectId,
        event: { type: EventType.VIEW_INSIGHTS_AUTH_METHODS, metadata: { projectId, days } },
        ...req.auditLogInfo
      });
      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/secrets/summary",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getInsightsSummary",
      description:
        "Get summary stats for the insights dashboard: upcoming rotations, upcoming reminders, and stale secrets",
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        projectId: z.string().trim(),
        staleSecretsOffset: z.coerce.number().min(0).default(0),
        staleSecretsLimit: z.coerce.number().min(1).max(100).default(50)
      }),
      response: {
        200: z.object({
          upcomingRotations: z.array(
            z.object({
              name: z.string(),
              environment: z.string(),
              secretPath: z.string(),
              nextRotationAt: z.date().nullable(),
              rotationStatus: z.string().nullable()
            })
          ),
          failedRotations: z.array(
            z.object({
              name: z.string(),
              environment: z.string(),
              secretPath: z.string(),
              nextRotationAt: z.date().nullable(),
              rotationStatus: z.string().nullable()
            })
          ),
          upcomingReminders: z.array(
            z.object({
              secretKey: z.string(),
              environment: z.string(),
              secretPath: z.string(),
              nextReminderDate: z.date()
            })
          ),
          overdueReminders: z.array(
            z.object({
              secretKey: z.string(),
              environment: z.string(),
              secretPath: z.string(),
              nextReminderDate: z.date()
            })
          ),
          staleSecrets: z.array(
            z.object({ key: z.string(), environment: z.string(), secretPath: z.string(), updatedAt: z.date() })
          ),
          totalStaleCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId, staleSecretsOffset, staleSecretsLimit } = req.query;
      const result = await server.services.insights.getSummary(
        { projectId, staleSecretsOffset, staleSecretsLimit },
        req.permission
      );
      await server.services.auditLog.createAuditLog({
        projectId,
        event: { type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_SUMMARY, metadata: { projectId } },
        ...req.auditLogInfo
      });
      return result;
    }
  });
};
