import { logger } from "@app/lib/logger";
import { QueueName, TQueueServiceFactory } from "@app/queue";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { TAuditReportDALFactory } from "./audit-report-dal";
import { csvFileNameFromLabel, presentAuditReport, presentOrgAuditReport, serializeReport } from "./audit-report-fns";
import {
  AUDIT_REPORT_DEFINITIONS,
  TAuditReportGeneratorDALs,
  TReportGenerationContext
} from "./audit-report-generators";
import { ORG_AUDIT_REPORT_DEFINITIONS, TOrgAuditReportGeneratorDALs } from "./audit-report-org-generators";
import { AuditReportStatus, TAuditReportResultEntry, TOrgAuditReportResultEntry } from "./audit-report-types";

const WORKER_CONCURRENCY = 2;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_DURATION_MS = 60 * 1000;

type TAuditReportQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  auditReportDAL: Pick<TAuditReportDALFactory, "findById" | "updateById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  orgDAL: Pick<TOrgDALFactory, "findOrgById" | "countAllOrgMembers" | "countSecretManagerProjectMembers">;
  smtpService: Pick<TSmtpService, "sendMail">;
} & TAuditReportGeneratorDALs &
  // orgDAL is declared above with the union of what the worker and the org generators need;
  // clickhouseAuditLogDAL intersects with the project generators' narrower Pick.
  Omit<TOrgAuditReportGeneratorDALs, "orgDAL">;

export type TAuditReportQueueServiceFactory = ReturnType<typeof auditReportQueueServiceFactory>;

export const auditReportQueueServiceFactory = ({
  queueService,
  auditReportDAL,
  projectDAL,
  orgDAL,
  smtpService,
  secretV2BridgeDAL,
  folderDAL,
  secretRotationV2DAL,
  reminderDAL,
  auditLogDAL,
  clickhouseAuditLogDAL,
  secretValidationRuleDAL,
  kmsService,
  insightsDAL,
  dynamicSecretLeaseDAL,
  identityOrgMembershipDAL
}: TAuditReportQueueServiceFactoryDep) => {
  const generatorDAL: TAuditReportGeneratorDALs = {
    secretV2BridgeDAL,
    folderDAL,
    secretRotationV2DAL,
    reminderDAL,
    auditLogDAL,
    clickhouseAuditLogDAL,
    secretValidationRuleDAL,
    kmsService
  };

  const orgGeneratorDAL: TOrgAuditReportGeneratorDALs = {
    insightsDAL,
    dynamicSecretLeaseDAL,
    orgDAL,
    identityOrgMembershipDAL,
    clickhouseAuditLogDAL
  };

  // Delivery and terminal-status handling are identical for both scopes; only the scope resolution,
  // the definition registry, and the email wording differ.
  const $deliverReport = async ({
    auditReportId,
    targetName,
    targetType,
    recipients,
    attachments,
    emailReports,
    resultSummary
  }: {
    auditReportId: string;
    targetName: string;
    targetType: "project" | "organization";
    recipients: string[];
    attachments: { filename: string; content: Buffer; contentType: string }[];
    emailReports: { label: string; rowCount: number; truncated: boolean }[];
    resultSummary: TAuditReportResultEntry[] | TOrgAuditReportResultEntry[];
  }) => {
    await smtpService.sendMail({
      template: SmtpTemplates.AuditReport,
      subjectLine: `Your Infisical report for ${targetName}`,
      recipients,
      substitutions: {
        targetName,
        targetType,
        reports: emailReports
      },
      attachments
    });

    const truncatedAny = emailReports.some((entry) => entry.truncated);
    await auditReportDAL.updateById(auditReportId, {
      status: truncatedAny ? AuditReportStatus.Partial : AuditReportStatus.Completed,
      // jsonb must be serialized before write (see requestReport for context).
      resultSummary: JSON.stringify(resultSummary),
      errorMessage: null
    });
  };

  const $generateProjectReport = async (auditReportId: string, report: Parameters<typeof presentAuditReport>[0]) => {
    const projectId = report.projectId as string;
    const project = await projectDAL.findById(projectId);
    if (!project) {
      throw new Error(`Project '${projectId}' not found`);
    }

    await auditReportDAL.updateById(auditReportId, { status: AuditReportStatus.Processing });

    const { reportConfigs, emailRecipients } = presentAuditReport(report);
    const context: TReportGenerationContext = {
      projectId,
      orgId: project.orgId,
      dal: generatorDAL
    };

    const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
    const resultSummary: TAuditReportResultEntry[] = [];

    for (const config of reportConfigs) {
      const definition = AUDIT_REPORT_DEFINITIONS[config.type];
      // eslint-disable-next-line no-await-in-loop
      const generated = await definition.run(context, config.inputs);
      attachments.push({
        filename: csvFileNameFromLabel(definition.label),
        content: serializeReport(generated),
        contentType: "text/csv"
      });
      resultSummary.push({ type: config.type, rowCount: generated.rows.length, truncated: generated.truncated });
    }

    await $deliverReport({
      auditReportId,
      targetName: project.name,
      targetType: "project",
      recipients: emailRecipients,
      attachments,
      emailReports: resultSummary.map((entry) => ({
        label: AUDIT_REPORT_DEFINITIONS[entry.type].label,
        rowCount: entry.rowCount,
        truncated: entry.truncated
      })),
      resultSummary
    });

    logger.info(`auditReportQueue: Audit report generated [auditReportId=${auditReportId}] [projectId=${projectId}]`);
  };

  const $generateOrgReport = async (auditReportId: string, report: Parameters<typeof presentOrgAuditReport>[0]) => {
    const orgId = report.orgId as string;
    const org = await orgDAL.findOrgById(orgId);
    if (!org) {
      throw new Error(`Organization '${orgId}' not found`);
    }

    await auditReportDAL.updateById(auditReportId, { status: AuditReportStatus.Processing });

    const { reportConfigs, emailRecipients } = presentOrgAuditReport(report);

    const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
    const resultSummary: TOrgAuditReportResultEntry[] = [];

    for (const config of reportConfigs) {
      const definition = ORG_AUDIT_REPORT_DEFINITIONS[config.type];
      // eslint-disable-next-line no-await-in-loop
      const generated = await definition.run({ orgId, dal: orgGeneratorDAL }, config.inputs);
      attachments.push({
        filename: csvFileNameFromLabel(definition.label),
        content: serializeReport(generated),
        contentType: "text/csv"
      });
      resultSummary.push({ type: config.type, rowCount: generated.rows.length, truncated: generated.truncated });
    }

    await $deliverReport({
      auditReportId,
      targetName: org.name,
      targetType: "organization",
      recipients: emailRecipients,
      attachments,
      emailReports: resultSummary.map((entry) => ({
        label: ORG_AUDIT_REPORT_DEFINITIONS[entry.type].label,
        rowCount: entry.rowCount,
        truncated: entry.truncated
      })),
      resultSummary
    });

    logger.info(`auditReportQueue: Org audit report generated [auditReportId=${auditReportId}] [orgId=${orgId}]`);
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
        if (report.orgId) {
          await $generateOrgReport(auditReportId, report);
        } else {
          await $generateProjectReport(auditReportId, report);
        }
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
