import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas/models";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { TPkiAlertChannelDALFactory } from "./pki-alert-channel-dal";
import { TPkiAlertHistoryDALFactory } from "./pki-alert-history-dal";
import { TPkiAlertV2DALFactory } from "./pki-alert-v2-dal";
import { parseTimeToDays, parseTimeToPostgresInterval } from "./pki-alert-v2-filter-utils";
import {
  CertificateOrigin,
  PkiAlertChannelType,
  PkiAlertEventType,
  TAlertV2Response,
  TChannelConfig,
  TCreateAlertV2DTO,
  TDeleteAlertV2DTO,
  TEmailChannelConfig,
  TGetAlertV2DTO,
  TListAlertsV2DTO,
  TListAlertsV2Response,
  TListCurrentMatchingCertificatesDTO,
  TListMatchingCertificatesDTO,
  TListMatchingCertificatesResponse,
  TPkiFilterRule,
  TUpdateAlertV2DTO
} from "./pki-alert-v2-types";

type TPkiAlertV2ServiceFactoryDep = {
  pkiAlertV2DAL: Pick<
    TPkiAlertV2DALFactory,
    | "create"
    | "findById"
    | "findByIdWithChannels"
    | "updateById"
    | "deleteById"
    | "findByProjectId"
    | "findByProjectIdWithCount"
    | "countByProjectId"
    | "findMatchingCertificates"
    | "transaction"
  >;
  pkiAlertChannelDAL: Pick<TPkiAlertChannelDALFactory, "create" | "findByAlertId" | "deleteByAlertId" | "insertMany">;
  pkiAlertHistoryDAL: Pick<TPkiAlertHistoryDALFactory, "createWithCertificates" | "findByAlertId">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  smtpService: Pick<TSmtpService, "sendMail">;
};

export type TPkiAlertV2ServiceFactory = ReturnType<typeof pkiAlertV2ServiceFactory>;

export const pkiAlertV2ServiceFactory = ({
  pkiAlertV2DAL,
  pkiAlertChannelDAL,
  pkiAlertHistoryDAL,
  permissionService,
  smtpService
}: TPkiAlertV2ServiceFactoryDep) => {
  type TAlertWithChannels = {
    id: string;
    name: string;
    description: string;
    eventType: string;
    alertBefore: string;
    filters: TPkiFilterRule[];
    enabled: boolean;
    projectId: string;
    createdAt: Date;
    updatedAt: Date;
    channels?: Array<{
      id: string;
      channelType: string;
      config: unknown;
      enabled: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>;
  };

  const formatAlertResponse = (alert: TAlertWithChannels): TAlertV2Response => {
    return {
      id: alert.id,
      name: alert.name,
      description: alert.description,
      eventType: alert.eventType as PkiAlertEventType,
      alertBefore: alert.alertBefore,
      filters: alert.filters,
      enabled: alert.enabled,
      projectId: alert.projectId,
      channels: (alert.channels || []).map((channel) => ({
        id: channel.id,
        channelType: channel.channelType as PkiAlertChannelType,
        config: channel.config as TChannelConfig,
        enabled: channel.enabled,
        createdAt: channel.createdAt,
        updatedAt: channel.updatedAt
      })),
      createdAt: alert.createdAt,
      updatedAt: alert.updatedAt
    };
  };

  const createAlert = async ({
    projectId,
    name,
    description,
    eventType,
    alertBefore,
    filters,
    enabled = true,
    channels,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TCreateAlertV2DTO): Promise<TAlertV2Response> => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.PkiAlerts);

    try {
      parseTimeToPostgresInterval(alertBefore);
    } catch (error) {
      throw new BadRequestError({ message: "Invalid alertBefore format. Use format like '30d', '1w', '3m', '1y'" });
    }

    return pkiAlertV2DAL.transaction(async (tx) => {
      const alert = await pkiAlertV2DAL.create(
        {
          projectId,
          name,
          description,
          eventType,
          alertBefore,
          filters,
          enabled
        },
        tx
      );

      const channelInserts = channels.map((channel) => ({
        alertId: alert.id,
        channelType: channel.channelType,
        config: channel.config,
        enabled: channel.enabled
      }));

      await pkiAlertChannelDAL.insertMany(channelInserts, tx);

      const completeAlert = await pkiAlertV2DAL.findByIdWithChannels(alert.id, tx);
      if (!completeAlert) {
        throw new NotFoundError({ message: "Failed to retrieve created alert" });
      }

      return formatAlertResponse(completeAlert as TAlertWithChannels);
    });
  };

  const getAlertById = async ({
    alertId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TGetAlertV2DTO): Promise<TAlertV2Response> => {
    const alert = await pkiAlertV2DAL.findByIdWithChannels(alertId);
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${alertId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: (alert as { projectId: string }).projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.PkiAlerts);

    return formatAlertResponse(alert as TAlertWithChannels);
  };

  const listAlerts = async ({
    projectId,
    search,
    eventType,
    enabled,
    limit = 20,
    offset = 0,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TListAlertsV2DTO): Promise<TListAlertsV2Response> => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.PkiAlerts);

    const filters = { search, eventType, enabled, limit, offset };

    const { alerts, total } = await pkiAlertV2DAL.findByProjectIdWithCount(projectId, filters);

    return {
      alerts: alerts.map((alert) => formatAlertResponse(alert as TAlertWithChannels)),
      total
    };
  };

  const updateAlert = async ({
    alertId,
    name,
    description,
    eventType,
    alertBefore,
    filters,
    enabled,
    channels,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateAlertV2DTO): Promise<TAlertV2Response> => {
    let alert = await pkiAlertV2DAL.findById(alertId);
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${alertId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: (alert as { projectId: string }).projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.PkiAlerts);

    if (alertBefore) {
      try {
        parseTimeToPostgresInterval(alertBefore);
      } catch (error) {
        throw new BadRequestError({ message: "Invalid alertBefore format. Use format like '30d', '1w', '3m', '1y'" });
      }
    }

    const updateData: {
      name?: string;
      description?: string;
      eventType?: PkiAlertEventType;
      alertBefore?: string;
      filters?: TPkiFilterRule[];
      enabled?: boolean;
    } = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (eventType !== undefined) updateData.eventType = eventType;
    if (alertBefore !== undefined) updateData.alertBefore = alertBefore;
    if (filters !== undefined) updateData.filters = filters;
    if (enabled !== undefined) updateData.enabled = enabled;

    return pkiAlertV2DAL.transaction(async (tx) => {
      alert = await pkiAlertV2DAL.updateById(alertId, updateData, tx);

      if (channels) {
        await pkiAlertChannelDAL.deleteByAlertId(alertId, tx);

        const channelInserts = channels.map((channel) => ({
          alertId,
          channelType: channel.channelType,
          config: channel.config,
          enabled: channel.enabled
        }));

        await pkiAlertChannelDAL.insertMany(channelInserts, tx);
      }

      const completeAlert = await pkiAlertV2DAL.findByIdWithChannels(alertId, tx);
      if (!completeAlert) {
        throw new NotFoundError({ message: "Failed to retrieve updated alert" });
      }

      return formatAlertResponse(completeAlert as TAlertWithChannels);
    });
  };

  const deleteAlert = async ({
    alertId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TDeleteAlertV2DTO): Promise<TAlertV2Response> => {
    const alert = await pkiAlertV2DAL.findByIdWithChannels(alertId);
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${alertId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: (alert as { projectId: string }).projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.PkiAlerts);

    const formattedAlert = formatAlertResponse(alert as TAlertWithChannels);
    await pkiAlertV2DAL.deleteById(alertId);

    return formattedAlert;
  };

  const listMatchingCertificates = async ({
    alertId,
    limit = 20,
    offset = 0,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TListMatchingCertificatesDTO): Promise<TListMatchingCertificatesResponse> => {
    const alert = await pkiAlertV2DAL.findById(alertId);
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${alertId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: (alert as { projectId: string }).projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.PkiAlerts);

    const options: {
      limit: number;
      offset: number;
      showPreview?: boolean;
      excludeAlerted?: boolean;
      alertId?: string;
    } = {
      limit,
      offset,
      showPreview: true,
      excludeAlerted: (alert as { eventType: string }).eventType === PkiAlertEventType.EXPIRATION,
      alertId
    };

    const result = await pkiAlertV2DAL.findMatchingCertificates(
      (alert as { projectId: string }).projectId,
      (alert as { filters: TPkiFilterRule[] }).filters,
      options
    );

    return {
      certificates: result.certificates,
      total: result.total
    };
  };

  const listCurrentMatchingCertificates = async ({
    projectId,
    filters,
    alertBefore,
    limit = 20,
    offset = 0,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TListCurrentMatchingCertificatesDTO): Promise<TListMatchingCertificatesResponse> => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.PkiAlerts);

    try {
      parseTimeToPostgresInterval(alertBefore);
    } catch (error) {
      throw new BadRequestError({ message: "Invalid alertBefore format. Use format like '30d', '1w', '3m', '1y'" });
    }

    const options: {
      limit: number;
      offset: number;
      showPreview?: boolean;
      alertBefore?: string;
    } = {
      limit,
      offset,
      showPreview: true,
      alertBefore: parseTimeToPostgresInterval(alertBefore)
    };

    const result = await pkiAlertV2DAL.findMatchingCertificates(projectId, filters, options);

    return {
      certificates: result.certificates,
      total: result.total
    };
  };

  const sendAlertNotifications = async (alertId: string, certificateIds: string[]) => {
    const alert = await pkiAlertV2DAL.findByIdWithChannels(alertId);
    if (!alert || !(alert as { enabled: boolean }).enabled) return;

    const channels =
      (alert as { channels?: Array<{ enabled: boolean; channelType: string; config: unknown }> }).channels?.filter(
        (channel: { enabled: boolean; channelType: string; config: unknown }) => channel.enabled
      ) || [];
    if (channels.length === 0) return;

    const { certificates } = await pkiAlertV2DAL.findMatchingCertificates(
      (alert as { projectId: string }).projectId,
      (alert as { filters: TPkiFilterRule[] }).filters,
      {
        alertBefore: parseTimeToPostgresInterval((alert as { alertBefore: string }).alertBefore)
      }
    );

    const matchingCertificates = certificates.filter(
      (cert) => certificateIds.includes(cert.id) && cert.enrollmentType !== CertificateOrigin.CA
    );

    if (matchingCertificates.length === 0) return;

    let hasNotificationSent = false;
    let notificationError: string | undefined;

    try {
      const emailChannels = channels.filter(
        (channel: { enabled: boolean; channelType: string; config: unknown }) =>
          channel.channelType === PkiAlertChannelType.EMAIL
      );

      const alertBeforeDays = parseTimeToDays((alert as { alertBefore: string }).alertBefore);
      const alertName = (alert as { name: string }).name;

      const emailPromises = emailChannels.map((channel) => {
        const config = channel.config as TEmailChannelConfig;

        return smtpService.sendMail({
          recipients: config.recipients,
          subjectLine: `Infisical Certificate Alert - ${alertName}`,
          substitutions: {
            alertName,
            alertBeforeDays,
            projectId: (alert as { projectId: string }).projectId,
            items: matchingCertificates.map((cert) => ({
              type: "Certificate",
              friendlyName: cert.commonName,
              serialNumber: cert.serialNumber,
              expiryDate: cert.notAfter.toLocaleDateString()
            }))
          },
          template: SmtpTemplates.PkiExpirationAlert
        });
      });

      await Promise.all(emailPromises);

      hasNotificationSent = true;
    } catch (error) {
      notificationError = error instanceof Error ? error.message : "Unknown error occurred";
      logger.error(error, `Failed to send notifications for alert ${alertId}`);
    }

    await pkiAlertHistoryDAL.createWithCertificates(alertId, certificateIds, {
      hasNotificationSent,
      notificationError
    });
  };

  return {
    createAlert,
    getAlertById,
    listAlerts,
    updateAlert,
    deleteAlert,
    listMatchingCertificates,
    listCurrentMatchingCertificates,
    sendAlertNotifications
  };
};
