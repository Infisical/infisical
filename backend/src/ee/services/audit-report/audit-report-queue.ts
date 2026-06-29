import { logger } from "@app/lib/logger";
import { QueueName, TQueueServiceFactory } from "@app/queue";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { TAuditReportDALFactory } from "./audit-report-dal";
import { presentAuditReport, serializeReportBundle, TAuditReportSection } from "./audit-report-fns";
import {
  AUDIT_REPORT_DEFINITIONS,
  TAuditReportGeneratorDALs,
  TReportGenerationContext
} from "./audit-report-generators";
import { AuditReportStatus, TAuditReportResultEntry } from "./audit-report-types";

const WORKER_CONCURRENCY = 2;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_DURATION_MS = 60 * 1000;

type TAuditReportQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  auditReportDAL: Pick<TAuditReportDALFactory, "findById" | "updateById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  smtpService: Pick<TSmtpService, "sendMail">;
} & TAuditReportGeneratorDALs;

export type TAuditReportQueueServiceFactory = ReturnType<typeof auditReportQueueServiceFactory>;

export const auditReportQueueServiceFactory = ({
  queueService,
  auditReportDAL,
  projectDAL,
  smtpService,
  secretV2BridgeDAL,
  folderDAL,
  secretRotationV2DAL,
  reminderDAL,
  auditLogDAL,
  secretValidationRuleDAL,
  kmsService
}: TAuditReportQueueServiceFactoryDep) => {
  const generatorDAL: TAuditReportGeneratorDALs = {
    secretV2BridgeDAL,
    folderDAL,
    secretRotationV2DAL,
    reminderDAL,
    auditLogDAL,
    secretValidationRuleDAL,
    kmsService
  };

  queueService.start(
    QueueName.AuditReportGeneration,
    async (job) => {
      const { auditReportId } = job.data;

      const report = await auditReportDAL.findById(auditReportId);
      if (!report) {
        logger.error(`Audit report generation skipped, report not found [auditReportId=${auditReportId}]`);
        return;
      }
      // A successfully delivered report is terminal; guard against duplicate job delivery.
      if (report.status === AuditReportStatus.Completed || report.status === AuditReportStatus.Partial) {
        return;
      }

      try {
        const project = await projectDAL.findById(report.projectId);
        if (!project) {
          throw new Error(`Project '${report.projectId}' not found`);
        }

        await auditReportDAL.updateById(auditReportId, { status: AuditReportStatus.Processing });

        const { reportConfigs, emailRecipients } = presentAuditReport(report);
        const context: TReportGenerationContext = {
          projectId: report.projectId,
          orgId: project.orgId,
          dal: generatorDAL
        };

        const sections: TAuditReportSection[] = [];
        const resultSummary: TAuditReportResultEntry[] = [];

        for (const config of reportConfigs) {
          const definition = AUDIT_REPORT_DEFINITIONS[config.type];
          // eslint-disable-next-line no-await-in-loop
          const generated = await definition.run(context, config.inputs);
          sections.push({ title: definition.label, report: generated });
          resultSummary.push({ type: config.type, rowCount: generated.rows.length, truncated: generated.truncated });
        }

        // All requested reports are combined into a single sectioned CSV attachment.
        const generatedAt = new Date();
        const csv = serializeReportBundle({ projectName: project.name, generatedAt, sections });

        await smtpService.sendMail({
          template: SmtpTemplates.AuditReport,
          subjectLine: `Your Infisical audit report for ${project.name}`,
          recipients: emailRecipients,
          substitutions: {
            projectName: project.name,
            reports: resultSummary.map((entry) => ({
              label: AUDIT_REPORT_DEFINITIONS[entry.type].label,
              rowCount: entry.rowCount,
              truncated: entry.truncated
            }))
          },
          attachments: [
            {
              filename: `infisical-audit-report-${generatedAt.toISOString().slice(0, 10)}.csv`,
              content: csv,
              contentType: "text/csv"
            }
          ]
        });

        const truncatedAny = resultSummary.some((entry) => entry.truncated);
        await auditReportDAL.updateById(auditReportId, {
          status: truncatedAny ? AuditReportStatus.Partial : AuditReportStatus.Completed,
          // jsonb must be serialized before write (see requestReport for context).
          resultSummary: JSON.stringify(resultSummary),
          errorMessage: null
        });

        logger.info(
          `auditReportQueue: Audit report generated [auditReportId=${auditReportId}] [projectId=${report.projectId}]`
        );
      } catch (error) {
        logger.error(error, `auditReportQueue: Audit report generation failed [auditReportId=${auditReportId}]`);
        await auditReportDAL.updateById(auditReportId, {
          status: AuditReportStatus.Failed,
          errorMessage: error instanceof Error ? error.message : "Unknown error during report generation"
        });
        throw error;
      }
    },
    { concurrency: WORKER_CONCURRENCY, limiter: { max: RATE_LIMIT_MAX, duration: RATE_LIMIT_DURATION_MS } }
  );

  return {};
};
