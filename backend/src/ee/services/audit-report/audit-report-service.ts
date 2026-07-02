import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionInsightsActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { PgSqlLock } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAuditReportDALFactory } from "./audit-report-dal";
import { presentAuditReport } from "./audit-report-fns";
import {
  AuditReportStatus,
  MAX_CONCURRENT_AUDIT_REPORTS,
  TAuditReportConfig,
  TAuditReportServiceActor,
  TListAuditReportsDTO,
  TRequestAuditReportDTO
} from "./audit-report-types";

const MAX_EMAIL_RECIPIENTS = 20;

type TAuditReportServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  auditReportDAL: TAuditReportDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  userDAL: Pick<TUserDALFactory, "findById">;
  queueService: Pick<TQueueServiceFactory, "queue">;
};

export type TAuditReportServiceFactory = ReturnType<typeof auditReportServiceFactory>;

export const auditReportServiceFactory = ({
  permissionService,
  licenseService,
  auditReportDAL,
  projectDAL,
  projectBotService,
  userDAL,
  queueService
}: TAuditReportServiceFactoryDep) => {
  // Report types and their inputs are validated at the request boundary by the router's discriminated
  // union, so here we only enforce that each report type appears at most once per batch (the array schema
  // can't express that) and normalize the stored shape.
  const $buildReportConfigs = (reports: TRequestAuditReportDTO["reports"]): TAuditReportConfig[] => {
    const seenTypes = new Set<string>();
    return reports.map(({ type, inputs }) => {
      if (seenTypes.has(type)) {
        throw new BadRequestError({ message: `Each report type can only be requested once per batch: ${type}` });
      }
      seenTypes.add(type);
      return { type, inputs: inputs ?? {} };
    });
  };

  const $resolveRecipients = async (
    requestedRecipients: string[] | undefined,
    actor: TAuditReportServiceActor
  ): Promise<string[]> => {
    if (requestedRecipients?.length) {
      if (requestedRecipients.length > MAX_EMAIL_RECIPIENTS) {
        throw new BadRequestError({ message: `A maximum of ${MAX_EMAIL_RECIPIENTS} recipients is allowed` });
      }
      return [...new Set(requestedRecipients.map((email) => email.trim().toLowerCase()))];
    }

    // Default to the requesting user's own email.
    const user = await userDAL.findById(actor.id);
    if (user?.email) {
      return [user.email];
    }

    throw new BadRequestError({ message: "At least one email recipient is required" });
  };

  const generateReport = async (dto: TRequestAuditReportDTO, actor: TAuditReportServiceActor) => {
    const plan = await licenseService.getPlan(actor.orgId);
    if (!plan.secretAccessInsights) {
      throw new BadRequestError({
        message: "Audit reports are not available on your plan. Please upgrade to access audit reports."
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: dto.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionInsightsActions.GenerateReport,
      ProjectPermissionSub.Insights
    );

    const project = await projectDAL.findById(dto.projectId);
    if (!project) {
      throw new NotFoundError({ message: `Project with ID '${dto.projectId}' not found` });
    }

    // Reports draw exclusively from the secret v2 data model; reject legacy projects up front with a clear
    // error instead of silently producing empty reports.
    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(dto.projectId);
    if (!shouldUseSecretV2Bridge) {
      throw new BadRequestError({ message: "Audit reports are not supported for this project version" });
    }

    const reportConfigs = $buildReportConfigs(dto.reports);
    const emailRecipients = await $resolveRecipients(dto.emailRecipients, actor);

    const report = await auditReportDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.AuditReportRequest(dto.projectId)]);

      const inFlightCount = await auditReportDAL.countInFlightByProject(dto.projectId, tx);
      if (inFlightCount >= MAX_CONCURRENT_AUDIT_REPORTS) {
        throw new BadRequestError({
          message: `This project already has ${MAX_CONCURRENT_AUDIT_REPORTS} reports in progress. Please wait for them to finish.`
        });
      }

      return auditReportDAL.create(
        {
          projectId: dto.projectId,
          requestedByUserId: actor.id,
          status: AuditReportStatus.Pending,
          // jsonb columns must be serialized before insert — pg otherwise treats a top-level JS array as a
          // Postgres array literal rather than a JSON value.
          reportConfigs: JSON.stringify(reportConfigs),
          emailRecipients
        },
        tx
      );
    });

    await queueService.queue(
      QueueName.AuditReportGeneration,
      QueueJobs.GenerateAuditReport,
      { auditReportId: report.id },
      {
        jobId: `audit-report-${report.id}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        removeOnFail: true
      }
    );

    logger.info(`Audit report requested [auditReportId=${report.id}] [projectId=${dto.projectId}]`);

    return presentAuditReport(report);
  };

  const listReports = async (dto: TListAuditReportsDTO, actor: TAuditReportServiceActor) => {
    const plan = await licenseService.getPlan(actor.orgId);
    if (!plan.secretAccessInsights) {
      throw new BadRequestError({
        message: "Audit reports are not available on your plan. Please upgrade to access audit reports."
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: dto.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionInsightsActions.Read,
      ProjectPermissionSub.Insights
    );

    const reports = await auditReportDAL.findByProject(dto.projectId, {
      offset: dto.offset,
      limit: dto.limit
    });
    const totalCount = await auditReportDAL.countByProject(dto.projectId);
    return { reports: reports.map(presentAuditReport), totalCount };
  };

  const getReportById = async (auditReportId: string, actor: TAuditReportServiceActor) => {
    const plan = await licenseService.getPlan(actor.orgId);
    if (!plan.secretAccessInsights) {
      throw new BadRequestError({
        message: "Audit reports are not available on your plan. Please upgrade to access audit reports."
      });
    }

    const report = await auditReportDAL.findById(auditReportId);

    if (!report) {
      throw new NotFoundError({ message: `Audit report with ID '${auditReportId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: report.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionInsightsActions.Read,
      ProjectPermissionSub.Insights
    );

    return presentAuditReport(report);
  };

  const deleteReport = async (auditReportId: string, actor: TAuditReportServiceActor) => {
    const report = await auditReportDAL.findById(auditReportId);

    if (!report) {
      throw new NotFoundError({ message: `Audit report with ID '${auditReportId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: report.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    if (!permission.can(ProjectPermissionInsightsActions.DeleteReport, ProjectPermissionSub.Insights)) {
      throw new NotFoundError({ message: `Audit report with ID '${auditReportId}' not found` });
    }

    await auditReportDAL.deleteById(report.id);
    return presentAuditReport(report);
  };

  return {
    generateReport,
    listReports,
    getReportById,
    deleteReport
  };
};
