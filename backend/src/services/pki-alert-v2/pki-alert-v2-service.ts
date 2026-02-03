import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, ProjectMembershipRole } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator/validate-url";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { TPkiAlertChannelDALFactory } from "./pki-alert-channel-dal";
import { TPkiAlertHistoryDALFactory } from "./pki-alert-history-dal";
import { TAlertWithChannels, TPkiAlertV2DALFactory } from "./pki-alert-v2-dal";
import { parseTimeToDays, parseTimeToPostgresInterval } from "./pki-alert-v2-filter-utils";
import {
  buildSlackPayload,
  buildWebhookPayload,
  triggerPkiWebhook,
  triggerSlackWebhook
} from "./pki-alert-v2-notification-fns";
import {
  CertificateOrigin,
  PkiAlertChannelType,
  PkiAlertEventType,
  PkiAlertRunStatus,
  PkiWebhookEventType,
  TAlertV2Response,
  TCertificatePreview,
  TChannelConfig,
  TChannelConfigResponse,
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
  TSlackChannelConfig,
  TTestWebhookConfigDTO,
  TUpdateAlertV2DTO,
  TWebhookChannelConfig
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
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export type TPkiAlertV2ServiceFactory = ReturnType<typeof pkiAlertV2ServiceFactory>;

export const pkiAlertV2ServiceFactory = ({
  pkiAlertV2DAL,
  pkiAlertChannelDAL,
  pkiAlertHistoryDAL,
  permissionService,
  smtpService,
  kmsService,
  notificationService,
  projectMembershipDAL,
  projectDAL
}: TPkiAlertV2ServiceFactoryDep) => {
  // Helper to encrypt channel config before storing in DB
  const encryptChannelConfig = (
    config: TChannelConfig,
    encryptor: (data: { plainText: Buffer }) => { cipherTextBlob: Buffer }
  ): Buffer => {
    return encryptor({ plainText: Buffer.from(JSON.stringify(config)) }).cipherTextBlob;
  };

  // Helper to decrypt channel config from DB
  const decryptChannelConfig = <T extends TChannelConfig>(
    channel: { config?: unknown; encryptedConfig?: Buffer | null },
    decryptor: (data: { cipherTextBlob: Buffer }) => Buffer
  ): T => {
    if (channel.encryptedConfig) {
      const decrypted = decryptor({ cipherTextBlob: channel.encryptedConfig });
      return JSON.parse(decrypted.toString()) as T;
    }
    // Fallback for old unencrypted data
    return channel.config as T;
  };

  const formatAlertResponse = (
    alert: TAlertWithChannels,
    decryptor: (data: { cipherTextBlob: Buffer }) => Buffer
  ): TAlertV2Response => {
    return {
      id: alert.id,
      name: alert.name,
      description: alert.description ?? null,
      eventType: alert.eventType as PkiAlertEventType,
      alertBefore: alert.alertBefore ?? "",
      filters: (alert.filters ?? []) as TPkiFilterRule[],
      enabled: alert.enabled ?? true,
      projectId: alert.projectId,
      channels: (alert.channels || []).map((channel) => {
        const config = decryptChannelConfig<TChannelConfig>(channel, decryptor);

        // For webhook channels, replace signingSecret with hasSigningSecret
        let responseConfig: TChannelConfigResponse;
        if (channel.channelType === PkiAlertChannelType.WEBHOOK) {
          const webhookConfig = config as TWebhookChannelConfig;
          responseConfig = {
            url: webhookConfig.url,
            hasSigningSecret: Boolean(webhookConfig.signingSecret)
          };
        } else {
          // For email and slack channels, the config is the same in request and response
          responseConfig = config as TEmailChannelConfig;
        }

        return {
          id: channel.id,
          channelType: channel.channelType as PkiAlertChannelType,
          config: responseConfig,
          enabled: channel.enabled,
          createdAt: channel.createdAt,
          updatedAt: channel.updatedAt
        };
      }),
      lastRun: alert.lastRunData
        ? {
            timestamp: alert.lastRunData.triggeredAt,
            status: alert.lastRunData.hasNotificationSent ? PkiAlertRunStatus.SUCCESS : PkiAlertRunStatus.FAILED,
            error: alert.lastRunData.notificationError
          }
        : null,
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

    // Validate webhook URLs early to provide immediate SSRF feedback
    for (const channel of channels) {
      if (channel.channelType === PkiAlertChannelType.WEBHOOK) {
        const webhookConfig = channel.config as TWebhookChannelConfig;
        // eslint-disable-next-line no-await-in-loop
        await blockLocalAndPrivateIpAddresses(webhookConfig.url);
      }
    }

    // Create encryptor/decryptor for webhook configs
    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

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
        config: null,
        encryptedConfig: encryptChannelConfig(channel.config, encryptor),
        enabled: channel.enabled
      }));

      await pkiAlertChannelDAL.insertMany(channelInserts, tx);

      const completeAlert = await pkiAlertV2DAL.findByIdWithChannels(alert.id, tx);
      if (!completeAlert) {
        throw new NotFoundError({ message: "Failed to retrieve created alert" });
      }

      return formatAlertResponse(completeAlert, decryptor);
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
      projectId: alert.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.PkiAlerts);

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: alert.projectId
    });

    return formatAlertResponse(alert, decryptor);
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

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    return {
      alerts: alerts.map((alert) => formatAlertResponse(alert, decryptor)),
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
      projectId: alert.projectId,
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

    // Validate webhook URLs early to provide immediate SSRF feedback
    if (channels) {
      for (const channel of channels) {
        if (channel.channelType === PkiAlertChannelType.WEBHOOK) {
          const webhookConfig = channel.config as TWebhookChannelConfig;
          // eslint-disable-next-line no-await-in-loop
          await blockLocalAndPrivateIpAddresses(webhookConfig.url);
        }
      }
    }

    // Create encryptor/decryptor for webhook configs
    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: alert.projectId
    });

    return pkiAlertV2DAL.transaction(async (tx) => {
      alert = await pkiAlertV2DAL.updateById(alertId, updateData, tx);

      if (channels) {
        // Get existing channels to preserve signing secrets if needed
        const existingChannels = await pkiAlertChannelDAL.findByAlertId(alertId, tx);
        const existingWebhookConfigs = new Map<string, TWebhookChannelConfig>();

        // Build a map of existing webhook configs by channel id for preserving signing secrets
        for (const existingChannel of existingChannels) {
          if (existingChannel.channelType === PkiAlertChannelType.WEBHOOK) {
            const config = decryptChannelConfig<TWebhookChannelConfig>(existingChannel, decryptor);
            existingWebhookConfigs.set(existingChannel.id, config);
          }
        }

        await pkiAlertChannelDAL.deleteByAlertId(alertId, tx);

        const channelInserts = channels.map((channel) => {
          let configToEncrypt = channel.config;

          // Handle webhook signing secret preserve/clear logic
          if (channel.channelType === PkiAlertChannelType.WEBHOOK) {
            const webhookConfig = channel.config as TWebhookChannelConfig;
            const existingConfig = channel.id ? existingWebhookConfigs.get(channel.id) : undefined;

            // If signingSecret is undefined and we have an existing config, preserve the existing secret
            // If signingSecret is null, explicitly clear it
            // If signingSecret has a value, use the new value
            let finalSigningSecret: string | undefined;
            if (webhookConfig.signingSecret === undefined && existingConfig?.signingSecret) {
              finalSigningSecret = existingConfig.signingSecret;
            } else if (webhookConfig.signingSecret === null) {
              finalSigningSecret = undefined;
            } else {
              finalSigningSecret = webhookConfig.signingSecret;
            }

            configToEncrypt = {
              url: webhookConfig.url,
              signingSecret: finalSigningSecret
            };
          }

          return {
            alertId,
            channelType: channel.channelType,
            config: null,
            encryptedConfig: encryptChannelConfig(configToEncrypt, encryptor),
            enabled: channel.enabled
          };
        });

        await pkiAlertChannelDAL.insertMany(channelInserts, tx);
      }

      const completeAlert = await pkiAlertV2DAL.findByIdWithChannels(alertId, tx);
      if (!completeAlert) {
        throw new NotFoundError({ message: "Failed to retrieve updated alert" });
      }

      return formatAlertResponse(completeAlert, decryptor);
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
      projectId: alert.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.PkiAlerts);

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: alert.projectId
    });

    const formattedAlert = formatAlertResponse(alert, decryptor);
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
      projectId: alert.projectId,
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
      excludeAlerted: alert.eventType === PkiAlertEventType.EXPIRATION,
      alertId
    };

    const result = await pkiAlertV2DAL.findMatchingCertificates(
      alert.projectId,
      alert.filters as TPkiFilterRule[],
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

  const sendEmailNotification = async (
    config: TEmailChannelConfig,
    alertName: string,
    alertBeforeDays: number,
    projectId: string,
    matchingCertificates: TCertificatePreview[]
  ) => {
    return smtpService.sendMail({
      recipients: config.recipients,
      subjectLine: `Infisical Certificate Alert - ${alertName}`,
      substitutions: {
        alertName,
        alertBeforeDays,
        projectId,
        items: matchingCertificates.map((cert) => ({
          type: "Certificate",
          friendlyName: cert.commonName,
          serialNumber: cert.serialNumber,
          expiryDate: cert.notAfter.toLocaleDateString()
        }))
      },
      template: SmtpTemplates.PkiExpirationAlert
    });
  };

  const sendWebhookNotification = async (
    config: TWebhookChannelConfig,
    alertData: { id: string; name: string; alertBefore: string; projectId: string },
    matchingCertificates: TCertificatePreview[],
    eventType: PkiWebhookEventType
  ) => {
    // Validate webhook URL to prevent SSRF
    await blockLocalAndPrivateIpAddresses(config.url);

    const appCfg = getConfig();
    const payload = buildWebhookPayload({
      alert: alertData,
      certificates: matchingCertificates,
      eventType,
      appUrl: appCfg.SITE_URL
    });

    return triggerPkiWebhook({
      url: config.url,
      payload,
      signingSecret: config.signingSecret ?? undefined
    });
  };

  const sendAlertNotifications = async (alertId: string, certificateIds: string[]) => {
    const alert = await pkiAlertV2DAL.findByIdWithChannels(alertId);
    if (!alert || !alert.enabled) return;

    const { projectId } = alert;
    const channels = alert.channels.filter((channel) => channel.enabled);
    if (channels.length === 0) return;

    const alertBefore = alert.alertBefore ?? "";
    const filters = (alert.filters ?? []) as TPkiFilterRule[];

    const { certificates } = await pkiAlertV2DAL.findMatchingCertificates(projectId, filters, {
      alertBefore: parseTimeToPostgresInterval(alertBefore)
    });

    const matchingCertificates = certificates.filter(
      (cert) => certificateIds.includes(cert.id) && cert.enrollmentType !== CertificateOrigin.CA
    );

    if (matchingCertificates.length === 0) return;

    let hasNotificationSent = false;
    let notificationError: string | undefined;
    const errors: string[] = [];

    const alertBeforeDays = parseTimeToDays(alertBefore);
    const alertData = {
      id: alert.id,
      name: alert.name,
      alertBefore,
      projectId
    };

    // Get decryptor for channel configs
    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    // Process each channel
    const channelPromises = channels.map(async (channel) => {
      try {
        switch (channel.channelType) {
          case PkiAlertChannelType.EMAIL: {
            const config = decryptChannelConfig<TEmailChannelConfig>(channel, decryptor);
            await sendEmailNotification(config, alert.name, alertBeforeDays, projectId, matchingCertificates);
            return { success: true, channelType: channel.channelType, recipients: config.recipients };
          }
          case PkiAlertChannelType.WEBHOOK: {
            const config = decryptChannelConfig<TWebhookChannelConfig>(channel, decryptor);
            const result = await sendWebhookNotification(
              config,
              alertData,
              matchingCertificates,
              PkiWebhookEventType.CERTIFICATE_EXPIRATION
            );

            if (!result.success) {
              throw new Error(result.error || "Webhook delivery failed");
            }
            return { success: true, channelType: channel.channelType, url: config.url };
          }
          case PkiAlertChannelType.SLACK: {
            const config = decryptChannelConfig<TSlackChannelConfig>(channel, decryptor);
            await blockLocalAndPrivateIpAddresses(config.webhookUrl);
            const appCfg = getConfig();
            const slackPayload = buildSlackPayload({
              alert: alertData,
              certificates: matchingCertificates,
              appUrl: appCfg.SITE_URL
            });
            const result = await triggerSlackWebhook({
              webhookUrl: config.webhookUrl,
              payload: slackPayload
            });
            if (!result.success) {
              throw new Error(result.error || "Slack webhook delivery failed");
            }
            return { success: true, channelType: channel.channelType, webhookUrl: config.webhookUrl };
          }
          default:
            return { success: false, channelType: channel.channelType, error: "Unknown channel type" };
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        logger.error(err, `Failed to send ${channel.channelType} notification for alert ${alertId}`);

        // Include context info in error result based on channel type
        if (channel.channelType === PkiAlertChannelType.EMAIL) {
          const config = decryptChannelConfig<TEmailChannelConfig>(channel, decryptor);
          return {
            success: false,
            channelType: channel.channelType,
            error: errorMessage,
            recipients: config.recipients
          };
        }
        if (channel.channelType === PkiAlertChannelType.WEBHOOK) {
          const config = decryptChannelConfig<TWebhookChannelConfig>(channel, decryptor);
          return { success: false, channelType: channel.channelType, error: errorMessage, url: config.url };
        }
        if (channel.channelType === PkiAlertChannelType.SLACK) {
          const config = decryptChannelConfig<TSlackChannelConfig>(channel, decryptor);
          return {
            success: false,
            channelType: channel.channelType,
            error: errorMessage,
            webhookUrl: config.webhookUrl
          };
        }

        return { success: false, channelType: channel.channelType, error: errorMessage };
      }
    });

    const results = await Promise.all(channelPromises);

    // All channels must succeed for notification to be considered sent
    hasNotificationSent = results.every((r) => r.success);

    // Collect errors from failed channels with context info
    results.forEach((r) => {
      if (!r.success && r.error) {
        if (r.channelType === PkiAlertChannelType.EMAIL && "recipients" in r && r.recipients) {
          errors.push(`EMAIL (recipients: ${r.recipients.join(", ")}): ${r.error}`);
        } else if (r.channelType === PkiAlertChannelType.WEBHOOK && "url" in r && r.url) {
          errors.push(`WEBHOOK (url: ${r.url}): ${r.error}`);
        } else if (r.channelType === PkiAlertChannelType.SLACK && "webhookUrl" in r && r.webhookUrl) {
          errors.push(`SLACK (webhookUrl: ${r.webhookUrl}): ${r.error}`);
        } else {
          errors.push(`${r.channelType}: ${r.error}`);
        }
      }
    });

    if (errors.length > 0) {
      notificationError = errors.join("\n");

      // Send in-app notifications to project admins
      try {
        const projectMembers = await projectMembershipDAL.findAllProjectMembers(projectId);
        const project = await projectDAL.findById(projectId);

        if (project) {
          const projectAdmins = projectMembers.filter((member) =>
            member.roles.some((role) => role.role === ProjectMembershipRole.Admin)
          );

          if (projectAdmins.length > 0) {
            const alertingPath = `/organizations/${project.orgId}/projects/cert-manager/${projectId}/alerting`;
            const truncatedError =
              notificationError.length > 200 ? `${notificationError.substring(0, 200)}...` : notificationError;

            await notificationService.createUserNotifications(
              projectAdmins.map((admin) => ({
                userId: admin.userId,
                orgId: project.orgId,
                type: NotificationType.PKI_ALERT_CHANNEL_FAILED,
                title: `PKI Alert Channel Failed: ${alert.name}`,
                body: `Your PKI alert **${alert.name}** failed to deliver notifications: \`${truncatedError}\``,
                link: alertingPath
              }))
            );
          }
        }
      } catch (notifyErr) {
        logger.error(notifyErr, `Failed to send in-app notification for PKI alert channel failure: ${alertId}`);
      }
    }

    await pkiAlertHistoryDAL.createWithCertificates(alertId, certificateIds, {
      hasNotificationSent,
      notificationError
    });
  };

  const testWebhookConfig = async ({
    projectId,
    url,
    signingSecret,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TTestWebhookConfigDTO): Promise<{ success: boolean; error?: string }> => {
    // Permission check - user must have edit access to PKI alerts in this project
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.PkiAlerts);

    // Create test data (SSRF validation is done in sendWebhookNotification)
    const alertData = {
      id: "00000000-0000-0000-0000-000000000000",
      name: "Test Alert",
      alertBefore: "30d",
      projectId
    };

    const testCertificates: TCertificatePreview[] = [
      {
        id: "00000000-0000-0000-0000-000000000000",
        serialNumber: "TEST-SERIAL-NUMBER",
        commonName: "test.example.com",
        san: ["test.example.com", "www.test.example.com"],
        profileName: "Test Profile",
        enrollmentType: CertificateOrigin.PROFILE,
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: "active"
      }
    ];

    try {
      const config: TWebhookChannelConfig = { url, signingSecret };
      const result = await sendWebhookNotification(
        config,
        alertData,
        testCertificates,
        PkiWebhookEventType.CERTIFICATE_TEST
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
      logger.error(err, `Failed to test webhook config for project ${projectId}`);
      return { success: false, error: errorMessage };
    }
  };

  return {
    createAlert,
    getAlertById,
    listAlerts,
    updateAlert,
    deleteAlert,
    listMatchingCertificates,
    listCurrentMatchingCertificates,
    sendAlertNotifications,
    testWebhookConfig
  };
};
