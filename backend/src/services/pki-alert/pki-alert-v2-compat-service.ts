import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TAlertChannelInput } from "@app/services/alert/alert-channel-service-types";
import { TAlertChannelTestServiceFactory } from "@app/services/alert/alert-channel-test-service";
import { AlertChannelType } from "@app/services/alert/alert-channel-types";
import { resolvePrincipalsInScope } from "@app/services/alert/alert-principal-scope-fns";
import { TAlertServiceFactory } from "@app/services/alert/alert-service";
import { TAlertResponse } from "@app/services/alert/alert-service-types";
import { AlertPrincipalType, AlertRunStatus } from "@app/services/alert/alert-types";
import {
  TApplicationActiveCertificate,
  TCertManagerApplicationAlertDALFactory
} from "@app/services/alert/providers/cert-manager-application-alert-dal";
import {
  CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
  CertificateAlertEvent,
  LEGACY_PKI_ALERT_EVENT_BY_CERTIFICATE_ALERT_EVENT
} from "@app/services/certificate/certificate-alert-events";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TPkiAlertV2DALFactory } from "@app/services/pki-alert-v2/pki-alert-v2-dal";
import { TPkiAlertV2ServiceFactory } from "@app/services/pki-alert-v2/pki-alert-v2-service";
import {
  CertificateOrigin,
  PkiAlertChannelType,
  PkiAlertEventType,
  PkiAlertRunStatus,
  TAlertV2Response,
  TCertificatePreview,
  TChannelConfigResponse,
  TCreateChannel,
  TListMatchingCertificatesDTO,
  TListMatchingCertificatesResponse,
  TPkiFilterRule
} from "@app/services/pki-alert-v2/pki-alert-v2-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import {
  TCreatePkiAlertRouteDTO,
  TGetPkiAlertRouteDTO,
  TListPkiAlertsRouteDTO,
  TPkiAlertRouteResponse,
  TTestPkiAlertWebhookRouteDTO,
  TUpdatePkiAlertRouteDTO
} from "./pki-alert-v2-compat-types";

const CHANNEL_NAMES: Record<PkiAlertChannelType, string> = {
  [PkiAlertChannelType.EMAIL]: "Email",
  [PkiAlertChannelType.WEBHOOK]: "Webhook",
  [PkiAlertChannelType.SLACK]: "Slack",
  [PkiAlertChannelType.PAGERDUTY]: "PagerDuty"
};

const LEGACY_EVENT_BY_EVENT = LEGACY_PKI_ALERT_EVENT_BY_CERTIFICATE_ALERT_EVENT as Record<string, PkiAlertEventType>;

const EVENT_BY_LEGACY_EVENT = Object.fromEntries(
  Object.entries(LEGACY_PKI_ALERT_EVENT_BY_CERTIFICATE_ALERT_EVENT).map(([event, legacyEvent]) => [legacyEvent, event])
) as Record<PkiAlertEventType, CertificateAlertEvent>;

type TCondition = { alertBefore?: string; dailyReminder?: boolean };

type TPkiAlertV2CompatServiceFactoryDep = {
  alertService: Pick<
    TAlertServiceFactory,
    "createAlert" | "getAlertById" | "listAlerts" | "updateAlert" | "deleteAlert"
  >;
  userDAL: Pick<TUserDALFactory, "find">;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  projectDAL: Pick<TProjectDALFactory, "findEffectiveProjectSubjectsMembership">;
  pkiAlertV2Service: Pick<
    TPkiAlertV2ServiceFactory,
    "listAlerts" | "getAlertById" | "updateAlert" | "deleteAlert" | "listMatchingCertificates" | "testWebhookConfig"
  >;
  alertChannelTestService: Pick<TAlertChannelTestServiceFactory, "testChannel">;
  pkiAlertV2DAL: Pick<TPkiAlertV2DALFactory, "findById">;
  certManagerApplicationAlertDAL: Pick<TCertManagerApplicationAlertDALFactory, "listActiveCertificates">;
};

export type TPkiAlertV2CompatServiceFactory = ReturnType<typeof pkiAlertV2CompatServiceFactory>;

export const pkiAlertV2CompatServiceFactory = ({
  alertService,
  userDAL,
  orgDAL,
  projectDAL,
  pkiAlertV2Service,
  pkiAlertV2DAL,
  certManagerApplicationAlertDAL,
  alertChannelTestService
}: TPkiAlertV2CompatServiceFactoryDep) => {
  const $assertNoFilters = (filters: TPkiFilterRule[]) => {
    if (filters.length) {
      throw new BadRequestError({
        message:
          "Certificate filters are no longer supported. An application alert covers every certificate in the application. Remove the filters."
      });
    }
  };

  const $normalizeAddresses = (emails: string[]) => [...new Set(emails.map((email) => email.trim().toLowerCase()))];

  const $userIdsOf = (channels: TAlertResponse["channels"]) =>
    channels.flatMap((channel) =>
      channel.recipients
        .filter((recipient) => recipient.principalType === AlertPrincipalType.USER)
        .map((recipient) => recipient.principalId)
    );

  const $buildEmailRecipientResolver = async (
    emails: string[],
    scope: { orgId: string; projectId: string },
    existingUserIds: Set<string>
  ) => {
    const addresses = $normalizeAddresses(emails);
    const users = addresses.length ? await userDAL.find({ $in: { username: addresses }, isGhost: false }) : [];
    const { userIds: inScope } = await resolvePrincipalsInScope(
      { orgDAL, projectDAL },
      { ...scope, userIds: users.map((user) => user.id), groupIds: [] }
    );
    const usersByAddress = new Map<string, typeof users>();
    users.forEach((user) => {
      usersByAddress.set(user.username, [...(usersByAddress.get(user.username) ?? []), user]);
    });

    return (channelEmails: string[]) =>
      $normalizeAddresses(channelEmails).flatMap((address) => {
        const matches = usersByAddress.get(address) ?? [];
        const member = matches.find((user) => inScope.has(user.id));
        if (member) return [{ principalType: AlertPrincipalType.USER, principalId: member.id }];
        if (matches.some((user) => existingUserIds.has(user.id))) return [];
        return [{ principalType: AlertPrincipalType.EMAIL, principalId: address }];
      });
  };

  const $toChannelInputs = async (
    channels: TCreateChannel[],
    scope: { orgId: string; projectId: string },
    existing: TAlertResponse["channels"] = []
  ): Promise<TAlertChannelInput[]> => {
    const takenNames = new Set<string>();
    const inputs: TAlertChannelInput[] = [];
    const emailsOf = (channel: TCreateChannel) => (channel.config as { recipients: string[] }).recipients;
    const resolveEmailRecipients = await $buildEmailRecipientResolver(
      channels.filter((channel) => channel.channelType === PkiAlertChannelType.EMAIL).flatMap(emailsOf),
      scope,
      new Set($userIdsOf(existing))
    );

    const claimedIds = new Set(channels.flatMap((channel) => (channel.id ? [channel.id] : [])));

    for (const channel of channels) {
      const current =
        existing.find((item) => item.id === channel.id && item.channelType === channel.channelType) ??
        (channel.id
          ? undefined
          : existing.find((item) => item.channelType === channel.channelType && !claimedIds.has(item.id)));
      if (current) claimedIds.add(current.id);
      let name = current?.name ?? CHANNEL_NAMES[channel.channelType];
      for (let suffix = 2; takenNames.has(name); suffix += 1) name = `${CHANNEL_NAMES[channel.channelType]} ${suffix}`;
      takenNames.add(name);

      const isEmail = channel.channelType === PkiAlertChannelType.EMAIL;
      const recipients = isEmail ? resolveEmailRecipients(emailsOf(channel)) : undefined;
      inputs.push({
        ...(current ? { id: current.id } : {}),
        name,
        channelType: channel.channelType as unknown as AlertChannelType,
        enabled: channel.enabled,
        config: isEmail ? {} : (channel.config as Record<string, unknown>),
        ...(recipients ? { recipients } : {})
      });
    }

    return inputs;
  };

  const $toLegacyChannelConfig = (channel: TAlertResponse["channels"][number]): TChannelConfigResponse => {
    if (channel.channelType !== PkiAlertChannelType.WEBHOOK) return channel.config as TChannelConfigResponse;
    const { url, signingSecret, hasSigningSecret } = channel.config as {
      url: string;
      signingSecret?: string;
      hasSigningSecret?: boolean;
    };
    return { url, hasSigningSecret: Boolean(signingSecret || hasSigningSecret) };
  };

  const $toLegacy = async (alerts: TAlertResponse[]): Promise<TPkiAlertRouteResponse[]> => {
    const userIds = alerts.flatMap((alert) => $userIdsOf(alert.channels));
    const users = userIds.length ? await userDAL.find({ $in: { id: [...new Set(userIds)] } }) : [];
    const emailById = new Map(users.map((user) => [user.id, user.email ?? user.username]));

    return alerts.map((alert) => {
      const condition = (alert.condition ?? {}) as TCondition;
      const eventType = LEGACY_EVENT_BY_EVENT[alert.eventType];
      const isExpiration = eventType === PkiAlertEventType.EXPIRATION;
      const { lastRun } = alert;

      return {
        id: alert.id,
        name: alert.name,
        description: alert.description,
        eventType,
        alertBefore: condition.alertBefore ?? "",
        filters: [],
        enabled: alert.enabled,
        projectId: alert.projectId as string,
        applicationId: alert.resourceId ?? null,
        applicationName: alert.resourceName,
        notificationConfig:
          isExpiration && condition.dailyReminder !== undefined
            ? { enableDailyNotification: condition.dailyReminder }
            : null,
        channels: alert.channels.map((channel) => ({
          id: channel.id,
          channelType: channel.channelType as PkiAlertChannelType,
          config:
            channel.channelType === PkiAlertChannelType.EMAIL
              ? {
                  recipients: channel.recipients
                    .map((recipient) =>
                      recipient.principalType === AlertPrincipalType.EMAIL
                        ? recipient.principalId
                        : emailById.get(recipient.principalId)
                    )
                    .filter((email): email is string => Boolean(email))
                }
              : $toLegacyChannelConfig(channel),
          enabled: channel.enabled,
          createdAt: channel.createdAt,
          updatedAt: channel.updatedAt
        })),
        lastRun: lastRun
          ? {
              timestamp: lastRun.timestamp,
              status: lastRun.status === AlertRunStatus.SUCCESS ? PkiAlertRunStatus.SUCCESS : PkiAlertRunStatus.FAILED,
              error: lastRun.error
            }
          : null,
        createdAt: alert.createdAt,
        updatedAt: alert.updatedAt
      };
    });
  };

  const $getAlert = async ({ alertId, applicationId, ...actor }: TGetPkiAlertRouteDTO) => {
    const alert = await alertService.getAlertById({ alertId, ...actor }, { revealSecrets: true });
    if (alert.resourceType !== CERT_MANAGER_APPLICATION_RESOURCE_TYPE) {
      throw new NotFoundError({ message: `Alert with ID '${alertId}' not found` });
    }
    if (applicationId && alert.resourceId !== applicationId) {
      throw new NotFoundError({
        message: `Alert with ID '${alertId}' is not scoped to application '${applicationId}'.`
      });
    }
    return alert;
  };

  const createAlert = async ({
    projectId,
    applicationId,
    name,
    description,
    eventType,
    alertBefore,
    filters,
    enabled,
    notificationConfig,
    channels,
    ...actor
  }: TCreatePkiAlertRouteDTO): Promise<TPkiAlertRouteResponse> => {
    if (!applicationId) {
      throw new BadRequestError({
        message:
          "Certificate alerts outside an application can no longer be created. Pass applicationId to create the alert in an application."
      });
    }
    if (eventType === PkiAlertEventType.EXPIRATION && !alertBefore) {
      throw new BadRequestError({ message: "alertBefore is required for expiration alerts" });
    }

    $assertNoFilters(filters);
    const condition: TCondition | null =
      eventType === PkiAlertEventType.EXPIRATION
        ? {
            alertBefore: alertBefore as string,
            ...(notificationConfig ? { dailyReminder: notificationConfig.enableDailyNotification } : {})
          }
        : null;

    const alert = await alertService.createAlert(
      {
        ...actor,
        name,
        description,
        resourceType: CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
        resourceId: applicationId,
        eventType: EVENT_BY_LEGACY_EVENT[eventType],
        condition,
        enabled,
        projectId,
        channels: await $toChannelInputs(channels, { orgId: actor.actorOrgId, projectId })
      },
      { revealSecrets: true }
    );

    const [legacy] = await $toLegacy([alert]);
    return legacy;
  };

  const getAlertById = async (dto: TGetPkiAlertRouteDTO): Promise<TPkiAlertRouteResponse> => {
    const [legacy] = await $toLegacy([await $getAlert(dto)]);
    return legacy;
  };

  const listAlerts = async ({
    projectId,
    applicationId,
    search,
    eventType,
    enabled,
    limit = 20,
    offset = 0,
    ...actor
  }: TListPkiAlertsRouteDTO): Promise<{ alerts: TPkiAlertRouteResponse[]; total: number }> => {
    const alerts = (
      await alertService.listAlerts(
        {
          ...actor,
          resourceType: CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
          projectId,
          ...(applicationId ? { resourceId: applicationId } : {}),
          ...(enabled !== undefined ? { enabled } : {})
        },
        { revealSecrets: true }
      )
    )
      .filter((alert) => !eventType || alert.eventType === EVENT_BY_LEGACY_EVENT[eventType])
      .filter((alert) => !search || alert.name.toLowerCase().includes(search.toLowerCase()))
      .reverse();

    return { alerts: await $toLegacy(alerts.slice(offset, offset + limit)), total: alerts.length };
  };

  const updateAlert = async ({
    alertId,
    applicationId,
    name,
    description,
    eventType,
    alertBefore,
    filters,
    enabled,
    notificationConfig,
    channels,
    ...actor
  }: TUpdatePkiAlertRouteDTO): Promise<TPkiAlertRouteResponse> => {
    const alert = await $getAlert({ alertId, applicationId, ...actor });

    const currentEventType = LEGACY_EVENT_BY_EVENT[alert.eventType];
    if (eventType && eventType !== currentEventType) {
      throw new BadRequestError({
        message: `An alert's event type can't be changed from '${currentEventType}' to '${eventType}'. Create a new alert for the '${eventType}' event instead.`
      });
    }

    const current = (alert.condition ?? {}) as TCondition;
    if (filters !== undefined) $assertNoFilters(filters);
    const conditionChanged = alertBefore !== undefined || notificationConfig !== undefined;
    const condition: TCondition = {
      ...current,
      ...(currentEventType === PkiAlertEventType.EXPIRATION && alertBefore !== undefined ? { alertBefore } : {}),
      ...(currentEventType === PkiAlertEventType.EXPIRATION && notificationConfig !== undefined
        ? { dailyReminder: notificationConfig ? notificationConfig.enableDailyNotification : undefined }
        : {})
    };

    const updated = await alertService.updateAlert(
      {
        ...actor,
        alertId,
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
        ...(conditionChanged ? { condition } : {}),
        ...(channels
          ? {
              channels: await $toChannelInputs(
                channels,
                { orgId: alert.orgId, projectId: alert.projectId as string },
                alert.channels
              )
            }
          : {})
      },
      { revealSecrets: true }
    );

    const [legacy] = await $toLegacy([updated]);
    return legacy;
  };

  const deleteAlert = async ({ applicationId, ...dto }: TGetPkiAlertRouteDTO): Promise<TPkiAlertRouteResponse> => {
    const [legacy] = await $toLegacy([await $getAlert({ ...dto, applicationId })]);
    await alertService.deleteAlert(dto);
    return legacy;
  };

  const $toCertificatePreview = (certificate: TApplicationActiveCertificate): TCertificatePreview => {
    let enrollmentType = CertificateOrigin.UNKNOWN;
    if (certificate.profileId) enrollmentType = CertificateOrigin.PROFILE;
    else if (certificate.pkiSubscriberId) enrollmentType = CertificateOrigin.IMPORT;

    return {
      id: certificate.id,
      serialNumber: certificate.serialNumber,
      commonName: certificate.commonName,
      san: (certificate.altNames ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
      profileName: certificate.profileName,
      enrollmentType,
      notBefore: certificate.notBefore,
      notAfter: certificate.notAfter,
      status: certificate.status
    };
  };

  const listMatchingCertificates = async ({
    alertId,
    limit = 20,
    offset = 0,
    ...actor
  }: TListMatchingCertificatesDTO): Promise<TListMatchingCertificatesResponse> => {
    const alert = await $getAlert({ alertId, ...actor });
    const { certificates, total } = await certManagerApplicationAlertDAL.listActiveCertificates({
      projectId: alert.projectId as string,
      applicationId: alert.resourceId as string,
      limit,
      offset,
      ...(alert.eventType === CertificateAlertEvent.Expiry ? { excludeAlertedByAlertId: alert.id } : {})
    });

    return { certificates: certificates.map($toCertificatePreview), total };
  };

  const $isLegacyProjectAlert = async (alertId: string) => Boolean(await pkiAlertV2DAL.findById(alertId));

  const $fromProjectAlert = (alert: TAlertV2Response): TPkiAlertRouteResponse => ({ ...alert, applicationId: null });

  const listProjectRouteAlerts = async (
    dto: TListPkiAlertsRouteDTO
  ): Promise<{ alerts: TPkiAlertRouteResponse[]; total: number }> => {
    if (dto.applicationId) return listAlerts(dto);

    const { limit = 20, offset = 0 } = dto;
    const window = { ...dto, limit: offset + limit, offset: 0 };
    const [projectAlerts, applicationAlerts] = await Promise.all([
      pkiAlertV2Service
        .listAlerts(window)
        .then(({ alerts, total }) => ({ alerts: alerts.map($fromProjectAlert), total })),
      listAlerts(window)
    ]);

    return {
      alerts: [...projectAlerts.alerts, ...applicationAlerts.alerts]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(offset, offset + limit),
      total: projectAlerts.total + applicationAlerts.total
    };
  };

  const getProjectRouteAlert = async (dto: TGetPkiAlertRouteDTO): Promise<TPkiAlertRouteResponse> =>
    (await $isLegacyProjectAlert(dto.alertId))
      ? $fromProjectAlert(await pkiAlertV2Service.getAlertById(dto))
      : getAlertById(dto);

  const updateProjectRouteAlert = async (dto: TUpdatePkiAlertRouteDTO): Promise<TPkiAlertRouteResponse> =>
    (await $isLegacyProjectAlert(dto.alertId))
      ? $fromProjectAlert(await pkiAlertV2Service.updateAlert(dto))
      : updateAlert(dto);

  const listProjectRouteMatchingCertificates = async (
    dto: TListMatchingCertificatesDTO
  ): Promise<TListMatchingCertificatesResponse> =>
    (await $isLegacyProjectAlert(dto.alertId))
      ? pkiAlertV2Service.listMatchingCertificates(dto)
      : listMatchingCertificates(dto);

  const testProjectRouteWebhook = async ({
    applicationId,
    url,
    signingSecret,
    ...dto
  }: TTestPkiAlertWebhookRouteDTO): Promise<{ success: boolean; error?: string }> => {
    if (!applicationId) return pkiAlertV2Service.testWebhookConfig({ url, signingSecret, ...dto });

    const { success, error } = await alertChannelTestService.testChannel({
      ...dto,
      resourceType: CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
      resourceId: applicationId,
      channelType: AlertChannelType.WEBHOOK,
      config: { url, ...(signingSecret ? { signingSecret } : {}) }
    });
    return { success, ...(error ? { error } : {}) };
  };

  const deleteProjectRouteAlert = async (dto: TGetPkiAlertRouteDTO): Promise<TPkiAlertRouteResponse> =>
    (await $isLegacyProjectAlert(dto.alertId))
      ? $fromProjectAlert(await pkiAlertV2Service.deleteAlert(dto))
      : deleteAlert(dto);

  return {
    createAlert,
    getAlertById,
    listAlerts,
    updateAlert,
    deleteAlert,
    listProjectRouteAlerts,
    getProjectRouteAlert,
    updateProjectRouteAlert,
    deleteProjectRouteAlert,
    listProjectRouteMatchingCertificates,
    testProjectRouteWebhook
  };
};
