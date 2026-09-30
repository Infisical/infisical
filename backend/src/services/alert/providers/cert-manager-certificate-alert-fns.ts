import { z } from "zod";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { ProjectPermissionActions } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TCertManagerProjectResolverFactory } from "@app/services/cert-manager-instance/cert-manager-project-resolver";
import { CertificateAlertEvent } from "@app/services/certificate/certificate-alert-events";
import { getRevocationReasonLabel } from "@app/services/pki-alert-v2/pki-alert-v2-types";

import { AlertChannelType, TAlertPayload, TAlertSeverity } from "../alert-channel-types";
import { durationToDays, expirySeverity, formatUtcDate, humanizeDays } from "../alert-format-fns";
import { AlertPermissionAction, DEFAULT_DEDUP_WINDOW_HOURS, TAlertContext } from "../alert-types";
import { TAlertCertificate } from "./cert-manager-certificate-alert-dal";

export const MAX_CERTIFICATE_ALERT_FILTER_IDS = 100;

const MIN_CERTIFICATE_ALERT_BEFORE_DAYS = 1;
const MAX_CERTIFICATE_ALERT_BEFORE_DAYS = 365;

const isValidAlertBefore = (alertBefore: string): boolean => {
  const days = durationToDays(alertBefore);
  return days >= MIN_CERTIFICATE_ALERT_BEFORE_DAYS && days <= MAX_CERTIFICATE_ALERT_BEFORE_DAYS;
};

export const CERTIFICATE_ALERT_TELEMETRY_TYPES: Record<CertificateAlertEvent, string> = {
  [CertificateAlertEvent.Expiry]: "expiration",
  [CertificateAlertEvent.Issuance]: "issuance",
  [CertificateAlertEvent.Renewal]: "renewal",
  [CertificateAlertEvent.Revocation]: "revocation"
};

export const ExpiryConditionFieldsSchema = z.object({
  alertBefore: z
    .string()
    .refine(
      isValidAlertBefore,
      `Must be a number of days, weeks, months or years adding up to ${MIN_CERTIFICATE_ALERT_BEFORE_DAYS} to ${MAX_CERTIFICATE_ALERT_BEFORE_DAYS} days, e.g. '30d' or '2w'`
    ),
  dailyReminder: z.boolean().optional()
});

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

export const CERTIFICATE_ALERT_PERMISSION_ACTIONS: Record<AlertPermissionAction, ProjectPermissionActions> = {
  [AlertPermissionAction.Read]: ProjectPermissionActions.Read,
  [AlertPermissionAction.Create]: ProjectPermissionActions.Create,
  [AlertPermissionAction.Edit]: ProjectPermissionActions.Edit,
  [AlertPermissionAction.Delete]: ProjectPermissionActions.Delete
};

const eventSeverity = (eventType: CertificateAlertEvent, targets: TAlertCertificate[]): TAlertSeverity => {
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

const inApplication = (applicationName?: string | null) =>
  applicationName ? ` in application '${applicationName}'` : "";

const buildSummary = (
  eventType: CertificateAlertEvent,
  targets: TAlertCertificate[],
  applicationName: string | null,
  alertBefore?: string
): string => {
  if (alertBefore) {
    const certificates = `${targets.length} certificate${targets.length === 1 ? "" : "s"}`;
    return `${certificates}${inApplication(applicationName)} expiring within ${humanizeDays(durationToDays(alertBefore))}`;
  }
  if (targets.length === 1) {
    return `Certificate '${targets[0].commonName}' ${EVENT_VERBS[eventType]}${inApplication(targets[0].applicationName)}`;
  }
  return `${targets.length} certificates ${EVENT_VERBS[eventType]}${inApplication(applicationName)}`;
};

const buildItemSummary = (eventType: CertificateAlertEvent, certificate: TAlertCertificate): string => {
  if (eventType === CertificateAlertEvent.Expiry) {
    return `Certificate '${certificate.commonName}'${inApplication(certificate.applicationName)} expires on ${formatUtcDate(certificate.notAfter)}`;
  }
  return `Certificate '${certificate.commonName}' ${EVENT_VERBS[eventType]}${inApplication(certificate.applicationName)}`;
};

const DAILY_CRON_DRIFT_MARGIN_HOURS = 4;

const expiryDedupWindowDays = (alertBefore: string, dailyReminder?: boolean): number => {
  const days = durationToDays(alertBefore);
  if (dailyReminder || days <= 7) return 1;
  if (days <= 30) return 2;
  if (days <= 90) return 7;
  return 30;
};

export const certificateAlertDedupWindowHours = (condition: unknown): number => {
  const parsed = ExpiryConditionFieldsSchema.safeParse(condition);
  if (!parsed.success) return DEFAULT_DEDUP_WINDOW_HOURS;
  return expiryDedupWindowDays(parsed.data.alertBefore, parsed.data.dailyReminder) * 24 - DAILY_CRON_DRIFT_MARGIN_HOURS;
};

export const buildCertificateAlertPayload = ({
  alert,
  targets,
  viewUrl,
  eventType,
  isApplicationAlert
}: {
  alert: TAlertContext;
  targets: TAlertCertificate[];
  viewUrl: string;
  eventType: CertificateAlertEvent;
  isApplicationAlert: boolean;
}): TAlertPayload => {
  const expiryCondition = ExpiryConditionFieldsSchema.safeParse(alert.condition);
  const alertBefore =
    eventType === CertificateAlertEvent.Expiry && expiryCondition.success
      ? expiryCondition.data.alertBefore
      : undefined;

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
    eventKey: alert.eventType,
    eventLabel: EVENT_LABELS[eventType],
    webhookType: `com.infisical.${alert.eventType}`,
    resourceKind: "Certificate",
    resourceOwnerKind: isApplicationAlert ? "Application" : "Certificate Manager",
    severity: eventSeverity(eventType, targets),
    summary: buildSummary(
      eventType,
      targets,
      isApplicationAlert ? (targets[0]?.applicationName ?? null) : null,
      alertBefore
    ),
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
          ...(!isApplicationAlert && certificate.applicationName
            ? [{ label: "Application", value: certificate.applicationName }]
            : []),
          { label: "Expires", value: formatUtcDate(certificate.notAfter) },
          ...(revocationReason ? [{ label: "Revocation Reason", value: revocationReason }] : [])
        ]
      };
    })
  };
};

export const assertCertificateAlertChannelTypesAllowed = async (
  licenseService: Pick<TLicenseServiceFactory, "getPlan">,
  { orgId, channelTypes }: { orgId: string; channelTypes: string[] }
) => {
  const gatedType = channelTypes.find((channelType) => channelType !== AlertChannelType.EMAIL);
  if (!gatedType) return;

  const plan = await licenseService.getPlan(orgId);
  if (!plan.pkiEnterpriseAlerting) {
    throw new BadRequestError({
      message: `Failed to add a ${gatedType} channel due to plan restriction. Upgrade plan to alert on channels other than email.`
    });
  }
};

export const resolveOrgCertManagerProjectId = async (
  certManagerProjectResolver: Pick<TCertManagerProjectResolverFactory, "getActiveProjectId">,
  orgId: string
): Promise<string> => {
  const projectId = await certManagerProjectResolver.getActiveProjectId(orgId);
  if (!projectId) {
    throw new NotFoundError({ message: "This organization has no Certificate Manager project" });
  }
  return projectId;
};
