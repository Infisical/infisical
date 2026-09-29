import { ForbiddenError } from "@casl/ability";
import { z } from "zod";

import { ActionProjectType, ResourceType } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { ResourcePermissionSub } from "@app/ee/services/permission/resource-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import {
  CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
  CertificateAlertEvent
} from "@app/services/certificate/certificate-alert-events";
import { getRevocationReasonLabel } from "@app/services/certificate/certificate-revocation-labels";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { AlertChannelType, TAlertPayload, TAlertSeverity } from "../alert-channel-types";
import { durationToDays, expirySeverity, formatUtcDate, humanizeDays } from "../alert-format-fns";
import {
  ALERT_SCAN_LEAD_INTERVAL,
  AlertPermissionAction,
  AlertTelemetryAction,
  AlertTriggerType,
  DEFAULT_DEDUP_WINDOW_HOURS,
  IEventAlertProvider,
  IScheduledAlertProvider,
  TAlertContext,
  TAlertPermissionInput,
  TAlertTelemetryEvent,
  TAlertTelemetryInput,
  TFindDueTargetsInput,
  TFindTargetsByIdsInput
} from "../alert-types";
import {
  TApplicationAlertCertificate,
  TCertManagerApplicationAlertDALFactory
} from "./cert-manager-application-alert-dal";

const TELEMETRY_ALERT_TYPE_BY_EVENT: Record<CertificateAlertEvent, string> = {
  [CertificateAlertEvent.Expiry]: "expiration",
  [CertificateAlertEvent.Issuance]: "issuance",
  [CertificateAlertEvent.Renewal]: "renewal",
  [CertificateAlertEvent.Revocation]: "revocation"
};

const MIN_CERTIFICATE_ALERT_BEFORE_DAYS = 1;
const MAX_CERTIFICATE_ALERT_BEFORE_DAYS = 365;

const isValidAlertBefore = (alertBefore: string): boolean => {
  const days = durationToDays(alertBefore);
  return days >= MIN_CERTIFICATE_ALERT_BEFORE_DAYS && days <= MAX_CERTIFICATE_ALERT_BEFORE_DAYS;
};

const ExpirationConditionSchema = z
  .object({
    alertBefore: z
      .string()
      .refine(
        isValidAlertBefore,
        `Must be a number of days, weeks, months or years adding up to ${MIN_CERTIFICATE_ALERT_BEFORE_DAYS} to ${MAX_CERTIFICATE_ALERT_BEFORE_DAYS} days, e.g. '30d' or '2w'`
      ),
    dailyReminder: z.boolean().optional()
  })
  .strict();

const EventConditionSchema = z.object({}).strict().nullish();

const EVENT_LABELS: Record<CertificateAlertEvent, string> = {
  [CertificateAlertEvent.Expiry]: "Expiration",
  [CertificateAlertEvent.Issuance]: "Issuance",
  [CertificateAlertEvent.Renewal]: "Renewal",
  [CertificateAlertEvent.Revocation]: "Revocation"
};

const EVENT_VERBS: Record<CertificateAlertEvent, string> = {
  [CertificateAlertEvent.Expiry]: "is expiring",
  [CertificateAlertEvent.Issuance]: "was issued",
  [CertificateAlertEvent.Renewal]: "was renewed",
  [CertificateAlertEvent.Revocation]: "was revoked"
};

const PERMISSION_ACTIONS: Record<AlertPermissionAction, ProjectPermissionActions> = {
  [AlertPermissionAction.Read]: ProjectPermissionActions.Read,
  [AlertPermissionAction.Create]: ProjectPermissionActions.Create,
  [AlertPermissionAction.Edit]: ProjectPermissionActions.Edit,
  [AlertPermissionAction.Delete]: ProjectPermissionActions.Delete
};

const eventSeverity = (eventType: CertificateAlertEvent, targets: TApplicationAlertCertificate[]): TAlertSeverity => {
  if (eventType === CertificateAlertEvent.Expiry) return expirySeverity(targets.map((target) => target.notAfter));
  if (eventType === CertificateAlertEvent.Revocation) return "warning";
  return "info";
};

const formatAltNames = (altNames: string | null): string =>
  (altNames ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .join(", ");

const buildSummary = (
  eventType: CertificateAlertEvent,
  targets: TApplicationAlertCertificate[],
  alertBefore?: string
): string => {
  const applicationName = targets[0]?.applicationName;
  const inApplication = applicationName ? ` in application '${applicationName}'` : "";
  if (alertBefore) {
    const certificates = `${targets.length} certificate${targets.length === 1 ? "" : "s"}`;
    return `${certificates}${inApplication} expiring within ${humanizeDays(durationToDays(alertBefore))}`;
  }
  if (targets.length === 1) return `Certificate '${targets[0].commonName}' ${EVENT_VERBS[eventType]}${inApplication}`;
  return `${targets.length} certificates ${EVENT_VERBS[eventType]}${inApplication}`;
};

const buildItemSummary = (eventType: CertificateAlertEvent, certificate: TApplicationAlertCertificate): string => {
  const inApplication = certificate.applicationName ? ` in application '${certificate.applicationName}'` : "";
  if (eventType === CertificateAlertEvent.Expiry) {
    return `Certificate '${certificate.commonName}'${inApplication} expires on ${formatUtcDate(certificate.notAfter)}`;
  }
  return `Certificate '${certificate.commonName}' ${EVENT_VERBS[eventType]}${inApplication}`;
};

const DAILY_SCAN_DEDUP_MARGIN_HOURS = 4;

const dayMultipleDedupWindowHours = (days: number): number => days * 24 - DAILY_SCAN_DEDUP_MARGIN_HOURS;

const expirationDedupWindowHours = (days: number, dailyReminder?: boolean): number => {
  if (dailyReminder || days <= 7) return dayMultipleDedupWindowHours(1);
  if (days <= 30) return dayMultipleDedupWindowHours(2);
  if (days <= 90) return dayMultipleDedupWindowHours(7);
  return dayMultipleDedupWindowHours(30);
};

export type TCertManagerApplicationAlertProviderDep = {
  certManagerApplicationAlertDAL: TCertManagerApplicationAlertDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export const certManagerApplicationAlertProviderFactory = ({
  certManagerApplicationAlertDAL,
  permissionService,
  licenseService
}: TCertManagerApplicationAlertProviderDep): IScheduledAlertProvider<TApplicationAlertCertificate> &
  IEventAlertProvider<TApplicationAlertCertificate> => {
  const buildViewUrl = async (alert: TAlertContext): Promise<string> => {
    const base = `${getConfig().SITE_URL}/organizations/${alert.orgId}/projects/cert-manager/${alert.projectId}`;
    const application = alert.resourceId
      ? await certManagerApplicationAlertDAL.findApplicationById(alert.resourceId)
      : undefined;
    return application ? `${base}/applications/${encodeURIComponent(application.name)}` : `${base}/applications`;
  };

  const findDueTargets = async (input: TFindDueTargetsInput): Promise<TApplicationAlertCertificate[]> => {
    if (!input.projectId || !input.resourceId) return [];
    const { alertBefore } = ExpirationConditionSchema.parse(input.condition);

    return certManagerApplicationAlertDAL.findExpiringCertificates({
      projectId: input.projectId,
      applicationId: input.resourceId,
      alertBeforeInterval: `${durationToDays(alertBefore)} days`,
      leadInterval: ALERT_SCAN_LEAD_INTERVAL,
      asOf: input.asOf
    });
  };

  const findTargetsByIds = async (input: TFindTargetsByIdsInput): Promise<TApplicationAlertCertificate[]> => {
    if (!input.projectId || !input.resourceId) return [];
    EventConditionSchema.parse(input.condition);

    return certManagerApplicationAlertDAL.findCertificatesByIds({
      projectId: input.projectId,
      applicationId: input.resourceId,
      certificateIds: input.targetIds
    });
  };

  const getTelemetryEvent = ({
    action,
    orgId,
    projectId,
    resourceId,
    eventType
  }: TAlertTelemetryInput): TAlertTelemetryEvent | undefined => {
    if (!projectId || !resourceId) return undefined;
    const properties = { orgId, projectId, applicationId: resourceId };
    switch (action) {
      case AlertTelemetryAction.Create:
        return {
          event: PostHogEventTypes.PkiAlertCreated,
          properties: {
            ...properties,
            alertType: TELEMETRY_ALERT_TYPE_BY_EVENT[eventType as CertificateAlertEvent]
          }
        };
      case AlertTelemetryAction.Update:
        return { event: PostHogEventTypes.PkiAlertUpdated, properties };
      default:
        return { event: PostHogEventTypes.PkiAlertDeleted, properties };
    }
  };

  const buildPayload = (
    alert: TAlertContext,
    targets: TApplicationAlertCertificate[],
    viewUrl: string
  ): TAlertPayload => {
    const eventType = alert.eventType as CertificateAlertEvent;
    const isExpiration = eventType === CertificateAlertEvent.Expiry;
    const alertBefore = isExpiration ? (alert.condition as { alertBefore?: string } | null)?.alertBefore : undefined;

    return {
      alert: {
        id: alert.id,
        name: alert.name,
        orgId: alert.orgId,
        ...(alert.projectId ? { projectId: alert.projectId } : {}),
        resourceType: alert.resourceType,
        ...(alertBefore ? { condition: alertBefore } : {}),
        viewUrl
      },
      eventKey: eventType,
      eventLabel: EVENT_LABELS[eventType],
      webhookType: `com.infisical.${eventType}`,
      resourceKind: "Certificate",
      resourceOwnerKind: "Application",
      severity: eventSeverity(eventType, targets),
      summary: buildSummary(eventType, targets, alertBefore),
      items: targets.map((certificate) => {
        const revocationReason =
          eventType === CertificateAlertEvent.Revocation
            ? getRevocationReasonLabel(certificate.revocationReason)
            : undefined;
        return {
          id: certificate.id,
          title: certificate.commonName,
          identifier: certificate.serialNumber,
          summary: buildItemSummary(eventType, certificate),
          severity: eventSeverity(eventType, [certificate]),
          fields: [
            ...(formatAltNames(certificate.altNames)
              ? [{ label: "SANs", value: formatAltNames(certificate.altNames) }]
              : []),
            ...(certificate.profileName ? [{ label: "Profile", value: certificate.profileName }] : []),
            { label: "Expires", value: formatUtcDate(certificate.notAfter) },
            ...(revocationReason ? [{ label: "Revocation Reason", value: revocationReason }] : [])
          ]
        };
      })
    };
  };

  const assertPermission = async ({ action, projectId, resourceId, actor }: TAlertPermissionInput): Promise<void> => {
    if (!projectId) {
      throw new BadRequestError({ message: "Certificate alerts must be created in Certificate Manager" });
    }

    if (!resourceId) {
      const { permission } = await permissionService.getProjectPermission({
        actor: actor.actor,
        actorId: actor.actorId,
        projectId,
        actorAuthMethod: actor.actorAuthMethod,
        actorOrgId: actor.actorOrgId,
        actionProjectType: ActionProjectType.CertificateManager
      });
      ForbiddenError.from(permission).throwUnlessCan(PERMISSION_ACTIONS[action], ProjectPermissionSub.PkiAlerts);
      return;
    }

    const { permission } = await permissionService.getResourcePermission({
      actor: actor.actor,
      actorId: actor.actorId,
      projectId,
      resourceType: ResourceType.CertificateApplication,
      resourceId,
      actorAuthMethod: actor.actorAuthMethod,
      actorOrgId: actor.actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(PERMISSION_ACTIONS[action], ResourcePermissionSub.PkiAlerts);
  };

  const assertResourceInScope = async (input: {
    orgId: string;
    projectId?: string | null;
    resourceId?: string | null;
  }): Promise<void> => {
    if (!input.resourceId) return;

    const application = await certManagerApplicationAlertDAL.findApplicationById(input.resourceId);
    if (!application || application.orgId !== input.orgId || application.projectId !== input.projectId) {
      throw new NotFoundError({
        message: `Application with ID '${input.resourceId}' not found in Certificate Manager`
      });
    }
  };

  const resolveProjectId = async ({ orgId, resourceId }: { orgId: string; resourceId: string }) => {
    const application = await certManagerApplicationAlertDAL.findApplicationById(resourceId);
    if (!application || application.orgId !== orgId) {
      throw new NotFoundError({ message: `Application with ID '${resourceId}' not found` });
    }
    return application.projectId;
  };

  const assertChannelTypesAllowed = async ({ orgId, channelTypes }: { orgId: string; channelTypes: string[] }) => {
    const gatedType = channelTypes.find((channelType) => channelType !== AlertChannelType.EMAIL);
    if (!gatedType) return;

    const plan = await licenseService.getPlan(orgId);
    if (!plan.pkiEnterpriseAlerting) {
      throw new BadRequestError({
        message: `Failed to add a ${gatedType} channel due to plan restriction. Upgrade plan to alert on channels other than email.`
      });
    }
  };

  return {
    resourceType: CERT_MANAGER_APPLICATION_RESOURCE_TYPE,
    allowsMultipleAlertsPerEvent: true,
    events: [
      {
        key: CertificateAlertEvent.Expiry,
        triggerType: AlertTriggerType.Scheduled,
        conditionSchema: ExpirationConditionSchema
      },
      ...[CertificateAlertEvent.Issuance, CertificateAlertEvent.Renewal, CertificateAlertEvent.Revocation].map(
        (key) => ({
          key,
          triggerType: AlertTriggerType.Event,
          conditionSchema: EventConditionSchema
        })
      )
    ],
    findDueTargets,
    findTargetsByIds,
    buildViewUrl,
    buildPayload,
    getTelemetryEvent,
    targetId: (certificate) => certificate.id,
    dedupWindowHours: (condition) => {
      const parsed = ExpirationConditionSchema.safeParse(condition);
      if (!parsed.success) return DEFAULT_DEDUP_WINDOW_HOURS;
      return expirationDedupWindowHours(durationToDays(parsed.data.alertBefore), parsed.data.dailyReminder);
    },
    assertPermission,
    assertResourceInScope,
    assertChannelTypesAllowed,
    resolveProjectId,
    getResourceNames: async ({ orgId, resourceIds }) =>
      new Map(
        (await certManagerApplicationAlertDAL.findApplicationNamesByIds(resourceIds, orgId)).map((app) => [
          app.id,
          app.name
        ])
      )
  };
};
