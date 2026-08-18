import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, OrganizationActionScope } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionInsightsActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { PgSqlLock } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAuditReportDALFactory } from "./audit-report-dal";
import { presentAuditReport, presentOrgAuditReport } from "./audit-report-fns";
import { ORG_AUDIT_REPORT_DEFINITIONS } from "./audit-report-org-generators";
import {
  AuditReportStatus,
  MAX_CONCURRENT_AUDIT_REPORTS,
  TAuditReportServiceActor,
  TListAuditReportsDTO,
  TListOrgAuditReportsDTO,
  TRequestAuditReportDTO,
  TRequestOrgAuditReportDTO
} from "./audit-report-types";

const MAX_EMAIL_RECIPIENTS = 20;

type TAuditReportServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  auditReportDAL: TAuditReportDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  userDAL: Pick<TUserDALFactory, "findById">;
  orgDAL: Pick<TOrgDALFactory, "findOrgMembersByUsername">;
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
  orgDAL,
  queueService
}: TAuditReportServiceFactoryDep) => {
  // Report types and their inputs are validated at the request boundary by the router's discriminated
  // union, so here we only enforce that each report type appears at most once per batch (the array schema
  // can't express that) and normalize the stored shape. Generic over the type enum so the project and
  // org report DTOs share it.
  const $buildReportConfigs = <TType extends string>(
    reports: { type: TType; inputs?: Record<string, unknown> }[]
  ): { type: TType; inputs: Record<string, unknown> }[] => {
    const seenTypes = new Set<string>();
    return reports.map(({ type, inputs }) => {
      if (seenTypes.has(type)) {
        throw new BadRequestError({ message: `Each report type can only be requested once per batch: ${type}` });
      }
      seenTypes.add(type);
      return { type, inputs: inputs ?? {} };
    });
  };

  const $assertRecipientsCanReadInsights = async (
    emails: string[],
    orgId: string,
    canRecipientReadInsights: (recipientUserId: string) => Promise<boolean>
  ) => {
    const orgMembers = await orgDAL.findOrgMembersByUsername(orgId, emails);

    const userIdByEmail = new Map<string, string>();
    orgMembers.forEach((member) => {
      if (!member.user?.id) return;
      if (member.username) userIdByEmail.set(member.username.toLowerCase(), member.user.id);
      if (member.user.email) userIdByEmail.set(member.user.email.toLowerCase(), member.user.id);
    });

    const checks = await Promise.all(
      emails.map(async (email) => {
        const recipientUserId = userIdByEmail.get(email);
        if (!recipientUserId) return { email, allowed: false };
        return { email, allowed: await canRecipientReadInsights(recipientUserId) };
      })
    );

    const rejectedEmails = checks.filter(({ allowed }) => !allowed).map(({ email }) => `'${email}'`);
    if (rejectedEmails.length) {
      throw new BadRequestError({
        message: `The following recipients cannot receive this report because they are not members of your organization with access to insights: ${rejectedEmails.join(
          ", "
        )}. Remove them from the recipient list, or grant them insights access, and try again.`
      });
    }
  };

  const $resolveRecipients = async (
    requestedRecipients: string[] | undefined,
    actor: TAuditReportServiceActor,
    canRecipientReadInsights: (recipientUserId: string) => Promise<boolean>
  ): Promise<string[]> => {
    if (requestedRecipients?.length) {
      if (requestedRecipients.length > MAX_EMAIL_RECIPIENTS) {
        throw new BadRequestError({ message: `A maximum of ${MAX_EMAIL_RECIPIENTS} recipients is allowed` });
      }
      const emails = [...new Set(requestedRecipients.map((email) => email.trim().toLowerCase()))];
      await $assertRecipientsCanReadInsights(emails, actor.orgId, canRecipientReadInsights);
      return emails;
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
    const emailRecipients = await $resolveRecipients(dto.emailRecipients, actor, async (recipientUserId) => {
      try {
        const { permission: recipientPermission } = await permissionService.getProjectPermission({
          actor: ActorType.USER,
          actorId: recipientUserId,
          projectId: dto.projectId,
          actorAuthMethod: null,
          actorOrgId: actor.orgId,
          actionProjectType: ActionProjectType.SecretManager
        });
        return recipientPermission.can(ProjectPermissionInsightsActions.Read, ProjectPermissionSub.Insights);
      } catch (error) {
        logger.debug(
          { error },
          `Audit report recipient cannot read project insights [projectId=${dto.projectId}] [userId=${recipientUserId}]`
        );
        return false;
      }
    });

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

    // An org-scoped report id presents as not found on the project endpoints (and vice versa).
    if (!report?.projectId) {
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

    // An org-scoped report id presents as not found on the project endpoints (and vice versa).
    if (!report?.projectId) {
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

  // Resolves the requesting actor's org-level permission; org reports are always scoped to the
  // actor's own org, so no caller-supplied org id is involved.
  const $getOrgInsightsPermission = async (actor: TAuditReportServiceActor) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });
    return permission;
  };

  const generateOrgReport = async (dto: TRequestOrgAuditReportDTO, actor: TAuditReportServiceActor) => {
    const plan = await licenseService.getPlan(actor.orgId);
    if (!plan.secretAccessInsights) {
      throw new BadRequestError({
        message: "Audit reports are not available on your plan. Please upgrade to access audit reports."
      });
    }

    const permission = await $getOrgInsightsPermission(actor);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionSecretsManagementInsightsActions.GenerateReport,
      OrgPermissionSubjects.SecretsManagementInsights
    );

    const reportConfigs = $buildReportConfigs(dto.reports);

    // Reports the instance cannot produce are rejected before anything is persisted, instead of
    // failing at generation time and wasting the org's concurrent-report slot.
    const appCfg = getConfig();
    const unsupported = reportConfigs.filter(
      (config) => ORG_AUDIT_REPORT_DEFINITIONS[config.type].requiresClickhouse && !appCfg.CLICKHOUSE_AUDIT_LOG_ENABLED
    );
    if (unsupported.length) {
      const labels = unsupported.map((config) => `'${ORG_AUDIT_REPORT_DEFINITIONS[config.type].label}'`).join(", ");
      throw new BadRequestError({
        message: `The following reports require audit logs to be stored in ClickHouse, which is not enabled on this instance: ${labels}`
      });
    }

    const emailRecipients = await $resolveRecipients(dto.emailRecipients, actor, async (recipientUserId) => {
      try {
        const { permission: recipientPermission } = await permissionService.getOrgPermission({
          scope: OrganizationActionScope.Any,
          actor: ActorType.USER,
          actorId: recipientUserId,
          orgId: actor.orgId,
          actorAuthMethod: null,
          actorOrgId: actor.orgId
        });
        return recipientPermission.can(
          OrgPermissionSecretsManagementInsightsActions.Read,
          OrgPermissionSubjects.SecretsManagementInsights
        );
      } catch (error) {
        logger.debug(
          { error },
          `Audit report recipient cannot read org insights [orgId=${actor.orgId}] [userId=${recipientUserId}]`
        );
        return false;
      }
    });

    const report = await auditReportDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.OrgAuditReportRequest(actor.orgId)]);

      const inFlightCount = await auditReportDAL.countInFlightByOrg(actor.orgId, tx);
      if (inFlightCount >= MAX_CONCURRENT_AUDIT_REPORTS) {
        throw new BadRequestError({
          message: `This organization already has ${MAX_CONCURRENT_AUDIT_REPORTS} reports in progress. Please wait for them to finish.`
        });
      }

      return auditReportDAL.create(
        {
          orgId: actor.orgId,
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

    logger.info(`Org audit report requested [auditReportId=${report.id}] [orgId=${actor.orgId}]`);

    return presentOrgAuditReport(report);
  };

  const listOrgReports = async (dto: TListOrgAuditReportsDTO, actor: TAuditReportServiceActor) => {
    const plan = await licenseService.getPlan(actor.orgId);
    if (!plan.secretAccessInsights) {
      throw new BadRequestError({
        message: "Audit reports are not available on your plan. Please upgrade to access audit reports."
      });
    }

    const permission = await $getOrgInsightsPermission(actor);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionSecretsManagementInsightsActions.Read,
      OrgPermissionSubjects.SecretsManagementInsights
    );

    const reports = await auditReportDAL.findByOrg(actor.orgId, { offset: dto.offset, limit: dto.limit });
    const totalCount = await auditReportDAL.countByOrg(actor.orgId);
    return { reports: reports.map(presentOrgAuditReport), totalCount };
  };

  const deleteOrgReport = async (auditReportId: string, actor: TAuditReportServiceActor) => {
    const report = await auditReportDAL.findById(auditReportId);

    // A missing report, a project-scoped report, and another org's report all present as not found,
    // so report ids cannot be probed across scopes or tenants.
    if (!report || !report.orgId || report.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Audit report with ID '${auditReportId}' not found` });
    }

    const permission = await $getOrgInsightsPermission(actor);
    if (
      !permission.can(
        OrgPermissionSecretsManagementInsightsActions.DeleteReport,
        OrgPermissionSubjects.SecretsManagementInsights
      )
    ) {
      throw new NotFoundError({ message: `Audit report with ID '${auditReportId}' not found` });
    }

    await auditReportDAL.deleteById(report.id);
    return presentOrgAuditReport(report);
  };

  return {
    generateReport,
    listReports,
    getReportById,
    deleteReport,
    generateOrgReport,
    listOrgReports,
    deleteOrgReport
  };
};
