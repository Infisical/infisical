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

export const registerAuditReportRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      body: z.object({
        projectId: z.string().trim(),
        reports: AuditReportRequestConfigSchema.array().min(1),
        emailRecipients: z.array(z.string().email()).optional()
      }),
      response: {
        200: AuditReportSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const report = await server.services.auditReport.generateReport(req.body, req.permission);
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
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      querystring: z.object({
        projectId: z.string().trim(),
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(10)
      }),
      response: {
        200: z.object({ reports: z.array(AuditReportSchema), totalCount: z.number() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId, offset, limit } = req.query;
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
    url: "/:auditReportId",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      params: z.object({ auditReportId: z.string().uuid() }),
      response: {
        200: AuditReportSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const report = await server.services.auditReport.getReportById(
        { auditReportId: req.params.auditReportId },
        req.permission
      );
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
    url: "/:auditReportId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      params: z.object({ auditReportId: z.string().uuid() }),
      querystring: z.object({ projectId: z.string().trim() }),
      response: {
        200: AuditReportSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const report = await server.services.auditReport.deleteReport(
        { projectId: req.query.projectId, auditReportId: req.params.auditReportId },
        req.permission
      );
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
