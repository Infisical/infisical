import { ForbiddenError } from "@casl/ability";
import { z } from "zod";

import { ActionProjectType, ProjectMembershipRole } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TCertManagerProjectResolverFactory } from "@app/services/cert-manager-instance/cert-manager-project-resolver";
import { getRevocationReasonLabel } from "@app/services/pki-alert-v2/pki-alert-v2-types";
import { PkiAlertScope, PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { AlertChannelType, TAlertPayload, TAlertSeverity } from "../alert-channel-types";
import { durationToDays, expirySeverity, formatUtcDate, humanizeDays } from "../alert-format-fns";
import {
  AlertPermissionAction,
  AlertTelemetryAction,
  DEFAULT_DEDUP_WINDOW_HOURS,
  TAlertContext,
  TAlertPermissionInput,
  TAlertTelemetryEvent
} from "../alert-types";
import { TAlertCertificate } from "./cert-manager-certificate-alert-dal";

const MIN_ALERT_BEFORE_DAYS = 1;
const MAX_ALERT_BEFORE_DAYS = 365;

const isValidAlertBefore = (alertBefore: string): boolean => {
  const days = durationToDays(alertBefore);
  return days >= MIN_ALERT_BEFORE_DAYS && days <= MAX_ALERT_BEFORE_DAYS;
};

export const ExpiryFieldsSchema = z.object({
  alertBefore: z
    .string()
    .refine(
      isValidAlertBefore,
      `Must be a number of days, weeks, months or years adding up to ${MIN_ALERT_BEFORE_DAYS} to ${MAX_ALERT_BEFORE_DAYS} days, e.g. '30d' or '2w'`
    ),
  dailyReminder: z.boolean().optional()
});

const DAILY_SCAN_DEDUP_MARGIN_HOURS = 4;

const dayMultipleDedupWindowHours = (days: number): number => days * 24 - DAILY_SCAN_DEDUP_MARGIN_HOURS;

const expirationDedupWindowHours = (days: number, dailyReminder?: boolean): number => {
  if (dailyReminder || days <= 7) return dayMultipleDedupWindowHours(1);
  if (days <= 30) return dayMultipleDedupWindowHours(2);
  if (days <= 90) return dayMultipleDedupWindowHours(7);
  return dayMultipleDedupWindowHours(30);
};

export const expiryDedupWindowHours = (condition: unknown): number => {
  const parsed = ExpiryFieldsSchema.safeParse(condition);
  if (!parsed.success) return DEFAULT_DEDUP_WINDOW_HOURS;
  return expirationDedupWindowHours(durationToDays(parsed.data.alertBefore), parsed.data.dailyReminder);
};

export const CERT_MANAGER_ALERT_PERMISSION_ACTIONS: Record<AlertPermissionAction, ProjectPermissionActions> = {
  [AlertPermissionAction.Read]: ProjectPermissionActions.Read,
  [AlertPermissionAction.Create]: ProjectPermissionActions.Create,
  [AlertPermissionAction.Edit]: ProjectPermissionActions.Edit,
  [AlertPermissionAction.Delete]: ProjectPermissionActions.Delete
};

export const getScopeWideAlertWebhookSource = ({ alertId }: { alertId: string }) => `/alerts/${alertId}`;

export const assertNoAlertResource = (resourceId: string | null | undefined, message: string) => {
  if (resourceId) throw new BadRequestError({ message });
};

export const assertCertManagerAdminAlertPermission = async (
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">,
  { action, projectId, actor }: Pick<TAlertPermissionInput, "action" | "actor"> & { projectId: string },
  adminOnlyMessage: string
) => {
  const { permission, hasRole } = await permissionService.getProjectPermission({
    actor: actor.actor,
    actorId: actor.actorId,
    projectId,
    actorAuthMethod: actor.actorAuthMethod,
    actorOrgId: actor.actorOrgId,
    actionProjectType: ActionProjectType.CertificateManager
  });
  ForbiddenError.from(permission).throwUnlessCan(
    CERT_MANAGER_ALERT_PERMISSION_ACTIONS[action],
    ProjectPermissionSub.PkiAlerts
  );

  const definesDelivery = action === AlertPermissionAction.Create || action === AlertPermissionAction.Edit;
  if (definesDelivery && !hasRole(ProjectMembershipRole.Admin)) {
    throw new ForbiddenRequestError({ message: adminOnlyMessage });
  }
};

export const splitAltNames = (altNames: string | null): string[] =>
  (altNames ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

export const certificateDisplayName = (certificate: {
  commonName: string;
  altNames: string | null;
  serialNumber: string;
}): string => certificate.commonName || splitAltNames(certificate.altNames)[0] || certificate.serialNumber;

export const assertCertManagerAlertChannelTypesAllowed = async (
  licenseService: Pick<TLicenseServiceFactory, "getPlan">,
  { orgId, channelTypes }: { orgId: string; channelTypes: string[] }
) => {
  const gatedType = channelTypes.find((channelType) => channelType !== AlertChannelType.EMAIL);
  if (!gatedType) return;

  const plan = await licenseService.getPlan(orgId);
  if (!plan.pkiEnterpriseAlerting) {
    throw new BadRequestError({
      message: `Failed to save a ${gatedType} channel due to plan restriction. Upgrade plan to alert on channels other than email, or disable or remove the ${gatedType} channel.`
    });
  }
};

export const resolveCertManagerProjectId = async (
  certManagerProjectResolver: Pick<TCertManagerProjectResolverFactory, "getActiveProjectId">,
  orgId: string
) => {
  const projectId = await certManagerProjectResolver.getActiveProjectId(orgId);
  if (!projectId) {
    throw new NotFoundError({ message: "Certificate Manager isn't set up for this organization" });
  }
  return projectId;
};

export const buildPkiAlertTelemetryEvent = (
  action: AlertTelemetryAction,
  properties: { orgId: string; projectId: string; applicationId?: string; alertScope: PkiAlertScope },
  alertType: string
): TAlertTelemetryEvent => {
  switch (action) {
    case AlertTelemetryAction.Create:
      return { event: PostHogEventTypes.PkiAlertCreated, properties: { ...properties, alertType } };
    case AlertTelemetryAction.Update:
      return { event: PostHogEventTypes.PkiAlertUpdated, properties };
    default:
      return { event: PostHogEventTypes.PkiAlertDeleted, properties };
  }
};

export enum CertificateAlertKind {
  Expiry = "expiry",
  Issuance = "issuance",
  Renewal = "renewal",
  Revocation = "revocation"
}

const CERTIFICATE_ALERT_KIND_LABELS: Record<CertificateAlertKind, string> = {
  [CertificateAlertKind.Expiry]: "Expiration",
  [CertificateAlertKind.Issuance]: "Issuance",
  [CertificateAlertKind.Renewal]: "Renewal",
  [CertificateAlertKind.Revocation]: "Revocation"
};

export const CERTIFICATE_ALERT_KIND_TELEMETRY_TYPES: Record<CertificateAlertKind, string> = {
  [CertificateAlertKind.Expiry]: "expiration",
  [CertificateAlertKind.Issuance]: "issuance",
  [CertificateAlertKind.Renewal]: "renewal",
  [CertificateAlertKind.Revocation]: "revocation"
};

const CERTIFICATE_ALERT_KIND_VERBS: Record<CertificateAlertKind, string> = {
  [CertificateAlertKind.Expiry]: "is expiring",
  [CertificateAlertKind.Issuance]: "was issued",
  [CertificateAlertKind.Renewal]: "was renewed",
  [CertificateAlertKind.Revocation]: "was revoked"
};

const certificateSeverity = (kind: CertificateAlertKind, targets: TAlertCertificate[]): TAlertSeverity => {
  if (kind === CertificateAlertKind.Expiry) return expirySeverity(targets.map((target) => target.notAfter));
  if (kind === CertificateAlertKind.Revocation) return "warning";
  return "info";
};

const inApplication = (applicationName?: string | null) =>
  applicationName ? ` in application '${applicationName}'` : "";

export const buildCertificateAlertPayload = ({
  alert,
  targets,
  viewUrl,
  kind,
  webhookSource,
  resourceOwnerKind,
  applicationName
}: {
  alert: TAlertContext;
  targets: TAlertCertificate[];
  viewUrl: string;
  kind: CertificateAlertKind;
  webhookSource?: string;
  resourceOwnerKind: string;
  applicationName: string | null;
}): TAlertPayload => {
  const alertBefore =
    kind === CertificateAlertKind.Expiry
      ? (alert.condition as { alertBefore?: string } | null)?.alertBefore
      : undefined;
  const verb = CERTIFICATE_ALERT_KIND_VERBS[kind];
  const certificates = `${targets.length} certificate${targets.length === 1 ? "" : "s"}`;
  let summary = `${certificates} ${verb}${inApplication(applicationName)}`;
  if (alertBefore) {
    summary = `${certificates}${inApplication(applicationName)} expiring within ${humanizeDays(durationToDays(alertBefore))}`;
  } else if (targets.length === 1) {
    summary = `Certificate '${certificateDisplayName(targets[0])}' ${verb}${inApplication(targets[0].applicationName)}`;
  }

  return {
    alert: {
      id: alert.id,
      name: alert.name,
      orgId: alert.orgId,
      ...(alert.projectId ? { projectId: alert.projectId } : {}),
      resourceType: alert.resourceType,
      ...(alert.resourceId ? { resourceId: alert.resourceId } : {}),
      ...(alertBefore ? { condition: alertBefore } : {}),
      viewUrl
    },
    eventKey: alert.eventType,
    eventLabel: CERTIFICATE_ALERT_KIND_LABELS[kind],
    webhookType: `com.infisical.${alert.eventType}`,
    webhookSource,
    resourceKind: "Certificate",
    resourceOwnerKind,
    severity: certificateSeverity(kind, targets),
    summary,
    items: targets.map((certificate) => {
      const revocationReason =
        kind === CertificateAlertKind.Revocation ? getRevocationReasonLabel(certificate.revocationReason) : undefined;
      const altNames = splitAltNames(certificate.altNames);
      const name = certificateDisplayName(certificate);
      return {
        id: certificate.id,
        title: name,
        summary:
          kind === CertificateAlertKind.Expiry
            ? `Certificate '${name}'${inApplication(certificate.applicationName)} expires on ${formatUtcDate(certificate.notAfter)}`
            : `Certificate '${name}' ${verb}${inApplication(certificate.applicationName)}`,
        severity: certificateSeverity(kind, [certificate]),
        fields: [
          { label: "Serial Number", value: certificate.serialNumber },
          ...(altNames.length ? [{ label: "SANs", value: altNames.join(", ") }] : []),
          ...(certificate.profileName ? [{ label: "Profile", value: certificate.profileName }] : []),
          ...(!alert.resourceId && certificate.applicationName
            ? [{ label: "Application", value: certificate.applicationName }]
            : []),
          { label: "Expires", value: formatUtcDate(certificate.notAfter) },
          ...(revocationReason ? [{ label: "Revocation Reason", value: revocationReason }] : [])
        ],
        resource: {
          id: certificate.id,
          serialNumber: certificate.serialNumber,
          commonName: certificate.commonName,
          altNames,
          status: certificate.status,
          notBefore: certificate.notBefore.toISOString(),
          notAfter: certificate.notAfter.toISOString(),
          revokedAt: certificate.revokedAt?.toISOString() ?? null,
          revocationReason: certificate.revocationReason,
          profileId: certificate.profileId,
          profileName: certificate.profileName,
          applicationId: certificate.applicationId,
          applicationName: certificate.applicationName
        }
      };
    })
  };
};
