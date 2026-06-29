import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAuditReportActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAuditReportDALFactory } from "./audit-report-dal";
import { presentAuditReport } from "./audit-report-fns";
import { AUDIT_REPORT_DEFINITIONS } from "./audit-report-generators";
import {
  AuditReportStatus,
  MAX_CONCURRENT_AUDIT_REPORTS,
  TAuditReportConfig,
  TAuditReportServiceActor,
  TDeleteAuditReportDTO,
  TGetAuditReportDTO,
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
  // Audit reports share the Secret Insights entitlement (license) but have their own permission subject
  // with granular Create/Read/Delete actions.
  const checkPermission = async (
    projectId: string,
    actor: TAuditReportServiceActor,
    action: ProjectPermissionAuditReportActions
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);
    if (!plan.secretAccessInsights) {
      throw new BadRequestError({
        message: "Audit reports are not available on your plan. Please upgrade to access audit reports."
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.AuditReports);
  };

  // Validate each requested report against its definition's input schema, applying defaults so the stored
  // config is canonical. Rejects unknown/duplicate types and malformed inputs before anything is persisted.
  const buildReportConfigs = (reports: TRequestAuditReportDTO["reports"]): TAuditReportConfig[] => {
    if (!reports.length) {
      throw new BadRequestError({ message: "At least one report must be requested" });
    }

    const seenTypes = new Set<string>();
    return reports.map(({ type, inputs }) => {
      const definition = AUDIT_REPORT_DEFINITIONS[type];
      if (!definition) {
        throw new BadRequestError({ message: `Unsupported report type: ${type}` });
      }
      if (seenTypes.has(type)) {
        throw new BadRequestError({ message: `Each report type can only be requested once per batch: ${type}` });
      }
      seenTypes.add(type);

      // Validate now so bad inputs are rejected before persistence; the raw inputs are stored as-is and the
      // generation worker re-parses (applying defaults/coercion) against the same schema at run time.
      const candidateInputs = inputs ?? {};
      const result = definition.inputsSchema.safeParse(candidateInputs);
      if (!result.success) {
        throw new BadRequestError({
          message: `Invalid inputs for ${type}: ${result.error.issues.map((issue) => issue.message).join(", ")}`
        });
      }
      return { type, inputs: candidateInputs };
    });
  };

  const resolveRecipients = async (
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
    if (actor.type === ActorType.USER) {
      const user = await userDAL.findById(actor.id);
      if (user?.email) return [user.email];
    }

    throw new BadRequestError({ message: "At least one email recipient is required" });
  };

  const requestReport = async (dto: TRequestAuditReportDTO, actor: TAuditReportServiceActor) => {
    await checkPermission(dto.projectId, actor, ProjectPermissionAuditReportActions.Create);

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

    const reportConfigs = buildReportConfigs(dto.reports);
    const emailRecipients = await resolveRecipients(dto.emailRecipients, actor);

    const inFlightCount = await auditReportDAL.countInFlightByProject(dto.projectId);
    if (inFlightCount >= MAX_CONCURRENT_AUDIT_REPORTS) {
      throw new BadRequestError({
        message: `This project already has ${MAX_CONCURRENT_AUDIT_REPORTS} reports in progress. Please wait for them to finish.`
      });
    }

    const report = await auditReportDAL.create({
      projectId: dto.projectId,
      requestedByUserId: actor.type === ActorType.USER ? actor.id : null,
      status: AuditReportStatus.Pending,
      // jsonb columns must be serialized before insert — pg otherwise treats a top-level JS array as a
      // Postgres array literal rather than a JSON value.
      reportConfigs: JSON.stringify(reportConfigs),
      emailRecipients
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
    await checkPermission(dto.projectId, actor, ProjectPermissionAuditReportActions.Read);

    const reports = await auditReportDAL.findByProject(dto.projectId, {
      offset: dto.offset,
      limit: dto.limit
    });
    const totalCount = await auditReportDAL.countByProject(dto.projectId);
    return { reports: reports.map(presentAuditReport), totalCount };
  };

  const getReportById = async (dto: TGetAuditReportDTO, actor: TAuditReportServiceActor) => {
    await checkPermission(dto.projectId, actor, ProjectPermissionAuditReportActions.Read);

    const report = await auditReportDAL.findById(dto.auditReportId);
    if (!report || report.projectId !== dto.projectId) {
      throw new NotFoundError({ message: `Audit report with ID '${dto.auditReportId}' not found` });
    }

    return presentAuditReport(report);
  };

  const deleteReport = async (dto: TDeleteAuditReportDTO, actor: TAuditReportServiceActor) => {
    await checkPermission(dto.projectId, actor, ProjectPermissionAuditReportActions.Delete);

    const report = await auditReportDAL.findById(dto.auditReportId);
    if (!report || report.projectId !== dto.projectId) {
      throw new NotFoundError({ message: `Audit report with ID '${dto.auditReportId}' not found` });
    }

    await auditReportDAL.deleteById(dto.auditReportId);
    return presentAuditReport(report);
  };

  return {
    requestReport,
    listReports,
    getReportById,
    deleteReport
  };
};
