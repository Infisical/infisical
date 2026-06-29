import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  AuditReportResultEntrySchema,
  AuditReportStatus,
  AuditReportType
} from "@app/ee/services/audit-report/audit-report-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

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
      operationId: "requestAuditReport",
      description: "Request generation of one or more audit reports, delivered by email as CSV attachments",
      security: [{ bearerAuth: [] }],
      body: z.object({
        projectId: z.string().trim(),
        reports: z
          .array(
            z.object({
              type: z.nativeEnum(AuditReportType),
              inputs: z.record(z.unknown()).optional()
            })
          )
          .min(1)
          .describe("The report types to generate, each with optional type-specific inputs."),
        emailRecipients: z
          .array(z.string().email())
          .optional()
          .describe("Email addresses to deliver the reports to. Defaults to the requesting user's email.")
      }),
      response: {
        200: AuditReportSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const report = await server.services.auditReport.requestReport(req.body, req.permission);
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
      operationId: "listAuditReports",
      description: "List audit reports for a project",
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        projectId: z.string().trim(),
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(10)
      }),
      response: {
        200: z.object({ reports: z.array(AuditReportSchema), totalCount: z.number() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
      operationId: "getAuditReport",
      description: "Get a single audit report by ID",
      security: [{ bearerAuth: [] }],
      params: z.object({ auditReportId: z.string().uuid() }),
      querystring: z.object({ projectId: z.string().trim() }),
      response: {
        200: AuditReportSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const report = await server.services.auditReport.getReportById(
        { projectId: req.query.projectId, auditReportId: req.params.auditReportId },
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
      operationId: "deleteAuditReport",
      description: "Delete an audit report",
      security: [{ bearerAuth: [] }],
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
