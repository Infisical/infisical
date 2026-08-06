import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  DaysAheadInputsSchema,
  NoInputsSchema,
  SecretAccessLogInputsSchema,
  StaleSecretsInputsSchema
} from "@app/ee/services/audit-report/audit-report-generators";
import {
  AuditReportResultEntrySchema,
  AuditReportStatus,
  AuditReportType
} from "@app/ee/services/audit-report/audit-report-types";
import { SecretsProjectWarningsSchema, SecretsUsageInsightsSchema } from "@app/ee/services/insights/insights-schemas";
import { INSIGHTS } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

// Each report type declares exactly which inputs it accepts. The `inputs` schemas are the same consts
// the generators use, so request validation and generation never drift.
const AuditReportRequestConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(AuditReportType.StaleSecrets), inputs: StaleSecretsInputsSchema.optional() }),
  z.object({ type: z.literal(AuditReportType.DuplicateSecrets), inputs: NoInputsSchema.optional() }),
  z.object({ type: z.literal(AuditReportType.SecretValidationCompliance), inputs: NoInputsSchema.optional() }),
  z.object({ type: z.literal(AuditReportType.UpcomingRotations), inputs: DaysAheadInputsSchema.optional() }),
  z.object({ type: z.literal(AuditReportType.FailedRotations), inputs: NoInputsSchema.optional() }),
  z.object({ type: z.literal(AuditReportType.UpcomingReminders), inputs: DaysAheadInputsSchema.optional() }),
  z.object({ type: z.literal(AuditReportType.SecretAccessLog), inputs: SecretAccessLogInputsSchema.optional() })
]);

const AuditReportConfigSchema = z.object({
  type: z.nativeEnum(AuditReportType),
  inputs: z.record(z.unknown())
});

const AuditReportSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string(),
  requestedByUserId: z.string().uuid().nullable(),
  status: z.nativeEnum(AuditReportStatus),
  reportConfigs: z.array(AuditReportConfigSchema),
  emailRecipients: z.string().array(),
  resultSummary: z.array(AuditReportResultEntrySchema).nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const registerInsightsRouter = async (server: FastifyZodProvider) => {
  // Org-scoped insights. These aggregate across every secret management project in the organization,
  // so they carry no :projectId and are gated on the org-level Secrets Management Insights subject.
  // Everything below this block is project-scoped and lives under /:projectId.

  server.route({
    method: "GET",
    url: "/secrets/usage-insights",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      operationId: "getSecretsUsageInsights",
      description: "Get secrets management usage counts for the requesting organization.",
      security: [{ bearerAuth: [] }],
      response: {
        200: z.object({
          usageInsights: SecretsUsageInsightsSchema
        })
      }
    },
    handler: async (req) => {
      const usageInsights = await server.services.insights.getSecretsUsageInsights({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_USAGE,
          metadata: usageInsights
        }
      });

      return { usageInsights };
    }
  });

  server.route({
    method: "GET",
    url: "/secrets/project-warnings",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      operationId: "getSecretsProjectWarnings",
      description:
        "List the organization's secret management projects with outstanding issue counts, ordered by severity.",
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        offset: z.coerce
          .number()
          .int()
          .min(0)
          .max(10000)
          .default(0)
          .describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.offset),
        limit: z.coerce.number().int().min(1).max(100).default(20).describe(INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.limit)
      }),
      response: {
        200: z.object({
          projectWarnings: SecretsProjectWarningsSchema
        })
      }
    },
    handler: async (req) => {
      const projectWarnings = await server.services.insights.getSecretsProjectWarnings({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId,
        offset: req.query.offset,
        limit: req.query.limit
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_PROJECT_WARNINGS,
          metadata: {
            totalProjects: projectWarnings.totalProjects,
            projectsWithIssues: projectWarnings.projectsWithIssues,
            offset: req.query.offset,
            limit: req.query.limit
          }
        }
      });

      return { projectWarnings };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/secrets/calendar",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getInsightsCalendar",
      description: "Get secret rotation and reminder events for a calendar month view",
      security: [{ bearerAuth: [] }],
      params: z.object({
        projectId: z.string().trim()
      }),
      querystring: z.object({
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
      const { projectId } = req.params;
      const { month, year } = req.query;
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
    url: "/:projectId/secrets/access-volume",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getInsightsAccessVolume",
      description: "Get secret access volume aggregated by day and actor for the past week",
      security: [{ bearerAuth: [] }],
      params: z.object({
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
      const { projectId } = req.params;
      const result = await server.services.insights.getAccessVolume({ projectId }, req.permission);
      await server.services.auditLog.createAuditLog({
        projectId,
        event: { type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_ACCESS_VOLUME, metadata: { projectId } },
        ...req.auditLogInfo
      });
      return result;
    }
  });

  // server.route({
  //   method: "GET",
  //   url: "/:projectId/secrets/access-locations",
  //   config: { rateLimit: readLimit },
  //   schema: {
  //     operationId: "getInsightsAccessLocations",
  //     description: "Get geographic locations of secret access based on audit log IP addresses",
  //     security: [{ bearerAuth: [] }],
  //     params: z.object({
  //       projectId: z.string().trim()
  //     }),
  //     querystring: z.object({
  //       days: z.coerce.number().min(1).max(90).default(30)
  //     }),
  //     response: {
  //       200: z.object({
  //         locations: z.array(
  //           z.object({ lat: z.number(), lng: z.number(), city: z.string(), country: z.string(), count: z.number() })
  //         )
  //       })
  //     }
  //   },
  //   onRequest: verifyAuth([AuthMode.JWT]),
  //   handler: async (req) => {
  //     const { projectId } = req.params;
  //     const { days } = req.query;
  //     const result = await server.services.insights.getAccessLocations({ projectId, days }, req.permission);
  //     await server.services.auditLog.createAuditLog({
  //       projectId,
  //       event: { type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_ACCESS_LOCATIONS, metadata: { projectId, days } },
  //       ...req.auditLogInfo
  //     });
  //     return result;
  //   }
  // });

  server.route({
    method: "GET",
    url: "/:projectId/auth/method-distribution",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getInsightsAuthMethodDistribution",
      description: "Get distribution of authentication methods from secret access audit logs",
      security: [{ bearerAuth: [] }],
      params: z.object({
        projectId: z.string().trim()
      }),
      querystring: z.object({
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
      const { projectId } = req.params;
      const { days } = req.query;
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
    url: "/:projectId/secrets/secrets-duplication",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getInsightsSecretsDuplication",
      description: "Get groups of duplicated secrets across environments and paths",
      security: [{ bearerAuth: [] }],
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          secretBlindIndexEnabled: z.boolean(),
          groups: z.array(
            z.object({
              secrets: z.array(
                z.object({
                  key: z.string(),
                  environment: z.object({
                    name: z.string(),
                    slug: z.string()
                  }),
                  secretPath: z.string()
                })
              )
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, reply) => {
      const { projectId } = req.params;
      const { result, remainingTTL } = await server.services.insights.getSecretsDuplication(
        { projectId },
        req.permission
      );
      await server.services.auditLog.createAuditLog({
        projectId,
        event: { type: EventType.VIEW_INSIGHTS_SECRETS_DUPLICATION, metadata: { projectId } },
        ...req.auditLogInfo
      });

      if (remainingTTL && remainingTTL >= 0) {
        void reply.header("X-Cache-TTL", remainingTTL);
      }

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/secrets/summary",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getInsightsSummary",
      description:
        "Get summary stats for the insights dashboard: upcoming rotations, upcoming reminders, and stale secrets",
      security: [{ bearerAuth: [] }],
      params: z.object({
        projectId: z.string().trim()
      }),
      querystring: z.object({
        staleSecretsOffset: z.coerce.number().min(0).max(10000).default(0),
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
      const { projectId } = req.params;
      const { staleSecretsOffset, staleSecretsLimit } = req.query;
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

  server.route({
    method: "GET",
    url: "/:projectId/secrets/counts",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getInsightsCounts",
      description: "Get project-wide entity counts for the insights dashboard header",
      security: [{ bearerAuth: [] }],
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          secretCount: z.number(),
          folderCount: z.number(),
          dynamicSecretCount: z.number(),
          secretRotationCount: z.number(),
          honeyTokenCount: z.number().nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId } = req.params;
      const result = await server.services.insights.getCounts({ projectId }, req.permission);
      await server.services.auditLog.createAuditLog({
        projectId,
        event: { type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_COUNTS, metadata: { projectId } },
        ...req.auditLogInfo
      });
      return result;
    }
  });

  server.route({
    method: "POST",
    url: "/:projectId/secrets/reports",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      params: z.object({
        projectId: z.string().trim()
      }),
      body: z.object({
        reports: AuditReportRequestConfigSchema.array().min(1),
        emailRecipients: z.array(z.string().email()).optional()
      }),
      response: {
        200: AuditReportSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const report = await server.services.auditReport.generateReport(
        { projectId: req.params.projectId, ...req.body },
        req.permission
      );
      await server.services.auditLog.createAuditLog({
        projectId: report.projectId,
        event: {
          type: EventType.CREATE_AUDIT_REPORT,
          metadata: {
            auditReportId: report.id,
            projectId: report.projectId,
            reportTypes: report.reportConfigs.map((config) => config.type),
            recipientCount: report.emailRecipients.length
          }
        },
        ...req.auditLogInfo
      });
      return report;
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/secrets/reports",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      params: z.object({
        projectId: z.string().trim()
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(10)
      }),
      response: {
        200: z.object({ reports: z.array(AuditReportSchema), totalCount: z.number() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId } = req.params;
      const { offset, limit } = req.query;
      const { reports, totalCount } = await server.services.auditReport.listReports(
        { projectId, offset, limit },
        req.permission
      );
      await server.services.auditLog.createAuditLog({
        projectId,
        event: { type: EventType.GET_AUDIT_REPORTS, metadata: { projectId } },
        ...req.auditLogInfo
      });
      return { reports, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/secrets/reports/:reportId",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      params: z.object({ projectId: z.string().trim(), reportId: z.string().uuid() }),
      response: {
        200: AuditReportSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const report = await server.services.auditReport.getReportById(req.params.reportId, req.permission);
      await server.services.auditLog.createAuditLog({
        projectId: report.projectId,
        event: {
          type: EventType.GET_AUDIT_REPORT,
          metadata: { auditReportId: report.id, projectId: report.projectId }
        },
        ...req.auditLogInfo
      });
      return report;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/secrets/reports/:reportId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      params: z.object({ projectId: z.string().trim(), reportId: z.string().uuid() }),
      response: {
        200: AuditReportSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const report = await server.services.auditReport.deleteReport(req.params.reportId, req.permission);
      await server.services.auditLog.createAuditLog({
        projectId: report.projectId,
        event: {
          type: EventType.DELETE_AUDIT_REPORT,
          metadata: { auditReportId: report.id, projectId: report.projectId }
        },
        ...req.auditLogInfo
      });
      return report;
    }
  });
};
